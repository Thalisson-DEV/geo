# ---- Build ----
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app

# Resolve dependencias primeiro (camada de cache)
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

# Codigo-fonte
COPY src src
RUN ./mvnw clean package -Dmaven.test.skip=true -B

# ---- Conversor de DWG (LibreDWG) ----
# O DWG e formato fechado: a Bussola le o projeto em DXF, e o dwg2dxf da LibreDWG (GNU, GPLv3, chamado como programa
# a parte) converte o DWG anexado na obra. O Alpine nao empacota a LibreDWG, entao ela e compilada aqui, na mesma
# versao de Alpine da imagem final. Versao e checksum fixos; codigo-fonte em https://ftp.gnu.org/gnu/libredwg/.
FROM alpine:3.24 AS libredwg
ARG LIBREDWG_VERSION=0.14
ARG LIBREDWG_SHA256=62ebb73b984f865960f20ed26619ea5f8789d5e3fd088fa40a2598384da81275
RUN apk add --no-cache build-base curl xz pkgconf python3 \
 && curl -fsSL -o /tmp/libredwg.tar.xz https://ftp.gnu.org/gnu/libredwg/libredwg-${LIBREDWG_VERSION}.tar.xz \
 && echo "${LIBREDWG_SHA256}  /tmp/libredwg.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/libredwg.tar.xz -C /tmp \
 && cd /tmp/libredwg-${LIBREDWG_VERSION} \
 && ./configure --prefix=/opt/libredwg --disable-bindings --disable-static \
 && make -j"$(nproc)" \
 && make install \
 && strip --strip-unneeded /opt/libredwg/bin/dwg2dxf /opt/libredwg/lib/libredwg.so.* \
 && /opt/libredwg/bin/dwg2dxf --version

# ---- Runtime ----
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Conversor de DWG: so o programa e a biblioteca dele.
COPY --from=libredwg /opt/libredwg/bin/dwg2dxf /opt/libredwg/bin/dwg2dxf
COPY --from=libredwg /opt/libredwg/lib/libredwg.so.0* /opt/libredwg/lib/
ENV LD_LIBRARY_PATH=/opt/libredwg/lib
ENV GEO_PROJETO_CONVERSOR_DWG="/opt/libredwg/bin/dwg2dxf -y -o {saida} {entrada}"

# Usuario nao-root
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080

# ---- Tuning de memoria da JVM ----
# O limite de cgroup do container no Railway e alto; com MaxRAMPercentage a JVM
# deixava o heap crescer ate ~1GB (e o Railway cobra por RSS usado). Aqui
# cravamos um teto de heap explicito e fazemos o G1 devolver memoria ociosa
# pro SO periodicamente. Calibravel sem rebuild:
#   - JVM_MAX_HEAP (default 384m): teto de heap. Suba p/ 512m se ver OOM em
#     importacoes CSV em lote pesadas; desca p/ 320m se sobrar folga.
#   - JVM_MAX_METASPACE (default 512m): teto das classes carregadas. A aplicacao
#     ja usa ~185MB so para subir; com 256m o processo caia por
#     "OutOfMemoryError: Metaspace" depois de algumas horas de uso. O teto so
#     reserva endereco: a memoria e consumida conforme as classes carregam.
#   - JVM_CPUS (default 4): o container enxerga 24 vCPUs, e a JVM dimensionava
#     por elas as threads do GC e do JIT, o pool das virtual threads e os event
#     loops do Redis, gastando memoria com threads ociosas.
#   - JAVA_OPTS: flags extras (vem por ultimo, sobrescrevem os defaults).
# stdout.encoding: sem locale no Alpine, acentos saiam corrompidos nos logs.
# exec -> java vira PID 1 e recebe SIGTERM do Railway (shutdown gracioso).
ENV JVM_MAX_HEAP=384m
ENV JVM_MAX_METASPACE=512m
ENV JVM_CPUS=4
ENV JAVA_OPTS=""
ENTRYPOINT ["sh", "-c", "exec java -XX:+UseG1GC -Xms128m -Xmx${JVM_MAX_HEAP} -XX:MaxMetaspaceSize=${JVM_MAX_METASPACE} -XX:ActiveProcessorCount=${JVM_CPUS} -XX:+UseStringDeduplication -XX:G1PeriodicGCInterval=60000 -XX:+G1PeriodicGCInvokesConcurrent -XX:+ExitOnOutOfMemoryError -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8 $JAVA_OPTS -jar app.jar"]
