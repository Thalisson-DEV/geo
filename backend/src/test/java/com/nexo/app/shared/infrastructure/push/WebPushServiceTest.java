package com.nexo.app.shared.infrastructure.push;

import org.junit.jupiter.api.Test;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

/** O corpo cifrado tem de ser decifrável pelo aparelho, como o navegador faz (RFC 8291). */
class WebPushServiceTest {

    @Test
    void semChavesOPushFicaDesligado() {
        WebPushService push = new WebPushService("", "", "mailto:x@example.com");
        assertThat(push.ligado()).isFalse();
        assertThat(push.enviar("https://push.example.com/x", "a", "b", "{}")).isEqualTo(WebPushService.Resultado.DESLIGADO);
    }

    @Test
    void chavesVapidValidasLigamOPush() throws Exception {
        KeyPair vapid = parP256();
        String publica = Base64.getUrlEncoder().withoutPadding().encodeToString(WebPushService.descomprimida((ECPublicKey) vapid.getPublic()));
        byte[] d = ((ECPrivateKey) vapid.getPrivate()).getS().toByteArray();
        String privada = Base64.getUrlEncoder().withoutPadding().encodeToString(d);

        WebPushService push = new WebPushService(publica, privada, "mailto:x@example.com");

        assertThat(push.ligado()).isTrue();
        assertThat(push.chavePublica()).isEqualTo(publica);
    }

    @Test
    void payloadCifradoEDecifradoPeloAparelho() throws Exception {
        KeyPair aparelho = parP256();
        byte[] publicaAparelho = WebPushService.descomprimida((ECPublicKey) aparelho.getPublic());
        byte[] auth = new byte[16];
        new SecureRandom().nextBytes(auth);
        String mensagem = "{\"notification\":{\"title\":\"Programação reprogramada\"}}";

        byte[] corpo = new WebPushService("", "", "mailto:x@example.com")
                .cifrar(mensagem.getBytes(StandardCharsets.UTF_8), publicaAparelho, auth);

        ByteBuffer leitura = ByteBuffer.wrap(corpo);
        byte[] sal = new byte[16];
        leitura.get(sal);
        assertThat(leitura.getInt()).isEqualTo(4096);
        byte[] publicaServidor = new byte[leitura.get()];
        leitura.get(publicaServidor);
        byte[] cifrado = new byte[leitura.remaining()];
        leitura.get(cifrado);

        KeyAgreement acordo = KeyAgreement.getInstance("ECDH");
        acordo.init(aparelho.getPrivate());
        acordo.doPhase(publica(publicaServidor, (ECPublicKey) aparelho.getPublic()), true);
        byte[] ecdh = acordo.generateSecret();
        byte[] ikm = hmac(hmac(auth, ecdh), concat("WebPush: info".getBytes(StandardCharsets.US_ASCII), new byte[]{0}, publicaAparelho, publicaServidor, new byte[]{1}));
        byte[] prk = hmac(sal, ikm);
        byte[] cek = Arrays.copyOf(hmac(prk, concat("Content-Encoding: aes128gcm".getBytes(StandardCharsets.US_ASCII), new byte[]{0, 1})), 16);
        byte[] nonce = Arrays.copyOf(hmac(prk, concat("Content-Encoding: nonce".getBytes(StandardCharsets.US_ASCII), new byte[]{0, 1})), 12);
        Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(Cipher.DECRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] claro = aes.doFinal(cifrado);

        assertThat(claro[claro.length - 1]).isEqualTo((byte) 2);
        assertThat(new String(claro, 0, claro.length - 1, StandardCharsets.UTF_8)).isEqualTo(mensagem);
    }

    private static KeyPair parP256() throws Exception {
        KeyPairGenerator gerador = KeyPairGenerator.getInstance("EC");
        gerador.initialize(new ECGenParameterSpec("secp256r1"));
        return gerador.generateKeyPair();
    }

    private static ECPublicKey publica(byte[] bytes, ECPublicKey referencia) throws Exception {
        ECPoint ponto = new ECPoint(new BigInteger(1, Arrays.copyOfRange(bytes, 1, 33)), new BigInteger(1, Arrays.copyOfRange(bytes, 33, 65)));
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(ponto, referencia.getParams()));
    }

    private static byte[] hmac(byte[] chave, byte[] dados) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(chave, "HmacSHA256"));
        return mac.doFinal(dados);
    }

    private static byte[] concat(byte[]... partes) {
        java.io.ByteArrayOutputStream saida = new java.io.ByteArrayOutputStream();
        for (byte[] p : partes) {
            saida.writeBytes(p);
        }
        return saida.toByteArray();
    }
}
