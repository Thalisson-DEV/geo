package com.nexo.app.shared.infrastructure.web;

import com.nexo.app.shared.application.dto.EnumDeUi;
import com.nexo.app.shared.application.dto.StatusDto;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Metadados de enums para popular filtros e tags sem duplicar rótulos no frontend. */
@RestController
@RequestMapping("/v1/meta/enums")
@Tag(name = "Metadados", description = "Enums com rótulo e severidade para a interface")
public class MetaEnumsController {

    private final Map<String, EnumDeUi> catalogo;

    public MetaEnumsController(List<EnumDeUi> enums) {
        this.catalogo = enums.stream()
                .collect(Collectors.toMap(EnumDeUi::nome, Function.identity(), (a, b) -> a, TreeMap::new));
    }

    @GetMapping
    @Operation(summary = "Lista os nomes dos enums disponíveis")
    public ResponseEntity<List<String>> nomes() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1)))
                .body(List.copyOf(catalogo.keySet()));
    }

    @GetMapping("/{nome}")
    @Operation(summary = "Valores de um enum com code, label e severity")
    public ResponseEntity<List<StatusDto>> valores(@PathVariable String nome) {
        EnumDeUi enumDeUi = catalogo.get(nome);
        if (enumDeUi == null) {
            throw new RecursoNaoEncontradoException("Enum '" + nome + "' não está publicado.");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1)))
                .body(enumDeUi.valores());
    }
}
