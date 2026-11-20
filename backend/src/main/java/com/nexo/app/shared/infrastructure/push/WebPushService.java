package com.nexo.app.shared.infrastructure.push;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;

/**
 * Envio de Web Push (RFC 8030) com payload cifrado em aes128gcm (RFC 8291) e identificação VAPID (RFC 8292), só com a
 * criptografia do JDK. Sem as chaves configuradas, fica desligado: o app vê os avisos ao abrir.
 */
@Slf4j
@Service
public class WebPushService {

    /** Desfecho de um envio. {@link #EXPIRADA}: o navegador desfez a assinatura e ela deve sair da base. */
    public enum Resultado { ENVIADO, EXPIRADA, FALHOU, DESLIGADO }

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder D64 = Base64.getUrlDecoder();
    private static final int TTL_SEGUNDOS = 24 * 60 * 60;

    private final String chavePublica;
    private final String assunto;
    private final ECPrivateKey privada;
    private final ECParameterSpec curva;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final SecureRandom aleatorio = new SecureRandom();

    public WebPushService(@Value("${geo.push.vapid-publica:}") String chavePublica,
                          @Value("${geo.push.vapid-privada:}") String chavePrivada,
                          @Value("${geo.push.assunto:mailto:suporte@example.com}") String assunto) {
        this.curva = curvaP256();
        this.assunto = assunto;
        ECPrivateKey chave = null;
        if (chavePublica != null && !chavePublica.isBlank() && chavePrivada != null && !chavePrivada.isBlank()) {
            try {
                chave = (ECPrivateKey) KeyFactory.getInstance("EC")
                        .generatePrivate(new ECPrivateKeySpec(new BigInteger(1, D64.decode(chavePrivada.trim())), curva));
            } catch (GeneralSecurityException | IllegalArgumentException e) {
                log.warn("Chave VAPID inválida: Web Push desligado.");
            }
        }
        this.privada = chave;
        this.chavePublica = chave != null ? chavePublica.trim() : null;
    }

    public boolean ligado() {
        return privada != null;
    }

    /** Chave pública VAPID (base64url), que o app usa ao assinar; nula com o push desligado. */
    public String chavePublica() {
        return chavePublica;
    }

    public Resultado enviar(String endpoint, String p256dh, String auth, String payloadJson) {
        if (!ligado()) {
            return Resultado.DESLIGADO;
        }
        try {
            byte[] corpo = cifrar(payloadJson.getBytes(StandardCharsets.UTF_8), D64.decode(p256dh), D64.decode(auth));
            URI uri = URI.create(endpoint);
            HttpRequest pedido = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(15))
                    .header("Content-Encoding", "aes128gcm")
                    .header("Content-Type", "application/octet-stream")
                    .header("TTL", String.valueOf(TTL_SEGUNDOS))
                    .header("Urgency", "high")
                    .header("Authorization", "vapid t=" + jwt(uri.getScheme() + "://" + uri.getAuthority()) + ", k=" + chavePublica)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(corpo))
                    .build();
            int status = http.send(pedido, HttpResponse.BodyHandlers.discarding()).statusCode();
            if (status == 404 || status == 410) {
                return Resultado.EXPIRADA;
            }
            return status >= 200 && status < 300 ? Resultado.ENVIADO : Resultado.FALHOU;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Resultado.FALHOU;
        } catch (Exception e) {
            log.warn("Falha ao enviar Web Push: {}", e.getMessage());
            return Resultado.FALHOU;
        }
    }

    /** Corpo aes128gcm de um único registro (RFC 8291 §4). */
    byte[] cifrar(byte[] payload, byte[] chaveDoAparelho, byte[] segredoAuth) throws GeneralSecurityException {
        KeyPairGenerator gerador = KeyPairGenerator.getInstance("EC");
        gerador.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair efemera = gerador.generateKeyPair();
        byte[] publicaServidor = descomprimida((ECPublicKey) efemera.getPublic());

        KeyAgreement acordo = KeyAgreement.getInstance("ECDH");
        acordo.init(efemera.getPrivate());
        acordo.doPhase(publicaDoAparelho(chaveDoAparelho), true);
        byte[] segredoEcdh = acordo.generateSecret();

        byte[] prkChave = hmac(segredoAuth, segredoEcdh);
        byte[] infoChave = concatenar("WebPush: info".getBytes(StandardCharsets.US_ASCII), new byte[]{0}, chaveDoAparelho, publicaServidor, new byte[]{1});
        byte[] ikm = hmac(prkChave, infoChave);

        byte[] sal = new byte[16];
        aleatorio.nextBytes(sal);
        byte[] prk = hmac(sal, ikm);
        byte[] cek = Arrays.copyOf(hmac(prk, concatenar("Content-Encoding: aes128gcm".getBytes(StandardCharsets.US_ASCII), new byte[]{0, 1})), 16);
        byte[] nonce = Arrays.copyOf(hmac(prk, concatenar("Content-Encoding: nonce".getBytes(StandardCharsets.US_ASCII), new byte[]{0, 1})), 12);

        Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] cifrado = aes.doFinal(concatenar(payload, new byte[]{2}));

        ByteBuffer cabecalho = ByteBuffer.allocate(16 + 4 + 1 + publicaServidor.length);
        cabecalho.put(sal).putInt(4096).put((byte) publicaServidor.length).put(publicaServidor);
        return concatenar(cabecalho.array(), cifrado);
    }

    private String jwt(String audiencia) throws GeneralSecurityException {
        String cabecalho = B64.encodeToString("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
        long expira = Instant.now().plus(Duration.ofHours(12)).getEpochSecond();
        String corpo = B64.encodeToString(("{\"aud\":\"" + audiencia + "\",\"exp\":" + expira + ",\"sub\":\"" + assunto + "\"}")
                .getBytes(StandardCharsets.UTF_8));
        Signature assinatura = Signature.getInstance("SHA256withECDSAinP1363Format");
        assinatura.initSign(privada);
        assinatura.update((cabecalho + "." + corpo).getBytes(StandardCharsets.US_ASCII));
        return cabecalho + "." + corpo + "." + B64.encodeToString(assinatura.sign());
    }

    private ECPublicKey publicaDoAparelho(byte[] bytes) throws GeneralSecurityException {
        if (bytes.length != 65 || bytes[0] != 4) {
            throw new GeneralSecurityException("Chave p256dh inválida.");
        }
        ECPoint ponto = new ECPoint(new BigInteger(1, Arrays.copyOfRange(bytes, 1, 33)), new BigInteger(1, Arrays.copyOfRange(bytes, 33, 65)));
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(ponto, curva));
    }

    static byte[] descomprimida(ECPublicKey chave) {
        byte[] saida = new byte[65];
        saida[0] = 4;
        copiar32(chave.getW().getAffineX(), saida, 1);
        copiar32(chave.getW().getAffineY(), saida, 33);
        return saida;
    }

    private static void copiar32(BigInteger valor, byte[] destino, int inicio) {
        byte[] bytes = valor.toByteArray();
        int origem = Math.max(0, bytes.length - 32);
        int tamanho = Math.min(32, bytes.length);
        System.arraycopy(bytes, origem, destino, inicio + 32 - tamanho, tamanho);
    }

    private static byte[] hmac(byte[] chave, byte[] dados) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(chave, "HmacSHA256"));
        return mac.doFinal(dados);
    }

    private static byte[] concatenar(byte[]... partes) {
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        for (byte[] parte : partes) {
            saida.writeBytes(parte);
        }
        return saida.toByteArray();
    }

    private static ECParameterSpec curvaP256() {
        try {
            KeyPairGenerator gerador = KeyPairGenerator.getInstance("EC");
            gerador.initialize(new ECGenParameterSpec("secp256r1"));
            return ((ECPublicKey) gerador.generateKeyPair().getPublic()).getParams();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
