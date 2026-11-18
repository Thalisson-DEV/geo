package com.nexo.app.modules.rh.infrastructure.persistence;

import com.nexo.app.modules.rh.domain.ParametrosRh;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface ParametrosRhRepository extends JpaRepository<ParametrosRh, UUID> {
}
