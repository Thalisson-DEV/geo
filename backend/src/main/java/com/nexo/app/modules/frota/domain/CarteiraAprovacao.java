package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Collection;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Placas que um aprovador aprova. As placas ficam gravadas uma a uma, mesmo quando vêm
 * do atalho "todas as placas da base": placa nova na base não entra sozinha.
 */
@Entity
@Table(name = "frota_carteiras_aprovacao")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CarteiraAprovacao extends BaseEntity {

    @Column(name = "id_usuario", nullable = false)
    private UUID idUsuario;

    @ElementCollection
    @CollectionTable(name = "frota_carteira_placas", joinColumns = @JoinColumn(name = "id_carteira"))
    @Column(name = "id_veiculo", nullable = false)
    private Set<UUID> idsVeiculo = new HashSet<>();

    public CarteiraAprovacao(UUID idUsuario) {
        if (idUsuario == null) {
            throw new InvarianteVioladaException("Informe o aprovador.");
        }
        this.idUsuario = idUsuario;
    }

    /** Troca as placas da carteira pela lista informada. */
    public void definirPlacas(Collection<UUID> idsVeiculo) {
        this.idsVeiculo.clear();
        incluirPlacas(idsVeiculo);
    }

    /** @return quantas placas entraram (as que já estavam não contam) */
    public int incluirPlacas(Collection<UUID> idsVeiculo) {
        int antes = this.idsVeiculo.size();
        if (idsVeiculo != null) {
            idsVeiculo.stream().filter(Objects::nonNull).forEach(this.idsVeiculo::add);
        }
        return this.idsVeiculo.size() - antes;
    }

    public boolean aprova(UUID idVeiculo) {
        return isAtivo() && idsVeiculo.contains(idVeiculo);
    }
}
