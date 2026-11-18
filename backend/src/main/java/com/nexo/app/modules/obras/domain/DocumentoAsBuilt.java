package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;
import java.util.UUID;

/**
 * Uma geração de documento de entrega: o As Built (plantas marcadas, fichas e fotos) ou o Book fotográfico (capa, sumário
 * e fotos por ponto). Cada tipo numera as suas versões; o arquivo fica nos anexos da obra e as anteriores continuam disponíveis.
 */
@Entity
@Table(name = "documentos_as_built")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DocumentoAsBuilt extends BaseEntity {

    public enum Status {
        PROCESSANDO,
        CONCLUIDO,
        ERRO
    }

    public enum Tipo {
        AS_BUILT,
        BOOK
    }

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 20, updatable = false)
    private Tipo tipo = Tipo.AS_BUILT;

    @Column(name = "total_paginas")
    private Integer totalPaginas;

    @Column(name = "total_fotos")
    private Integer totalFotos;

    @Column(name = "id_obra", nullable = false, updatable = false)
    private UUID idObra;

    @Column(name = "numero_versao", nullable = false, updatable = false)
    private int numeroVersao;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status = Status.PROCESSANDO;

    @Column(name = "id_anexo")
    private UUID idAnexo;

    @Column(name = "mensagem_erro", length = 500)
    private String mensagemErro;

    public DocumentoAsBuilt(UUID idObra, int numeroVersao) {
        this(idObra, Tipo.AS_BUILT, numeroVersao);
    }

    public DocumentoAsBuilt(UUID idObra, Tipo tipo, int numeroVersao) {
        this.idObra = Objects.requireNonNull(idObra);
        this.tipo = Objects.requireNonNull(tipo);
        this.numeroVersao = numeroVersao;
    }

    public void concluir(UUID idAnexo) {
        this.status = Status.CONCLUIDO;
        this.idAnexo = Objects.requireNonNull(idAnexo);
    }

    /** Conclui guardando o tamanho do documento, para o histórico de versões. */
    public void concluir(UUID idAnexo, int paginas, int fotos) {
        concluir(idAnexo);
        this.totalPaginas = paginas;
        this.totalFotos = fotos;
    }

    public boolean isConcluido() {
        return status == Status.CONCLUIDO;
    }

    public void falhar(String mensagem) {
        this.status = Status.ERRO;
        this.mensagemErro = mensagem;
    }
}
