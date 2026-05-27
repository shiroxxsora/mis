package com.mis.servicelogic.controller;

import com.mis.servicelogic.client.HasuraClient;
import com.mis.servicelogic.dto.SavePatientSummaryRequest;
import com.mis.servicelogic.dto.UpdateAttendanceRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/patients")
public class PatientDataController {

    private final HasuraClient hasuraClient;

    public PatientDataController(HasuraClient hasuraClient) {
        this.hasuraClient = hasuraClient;
    }

    @PutMapping("/{id}/attendance-probability")
    public ResponseEntity<Void> updateAttendanceProbability(
            @PathVariable int id,
            @Valid @RequestBody UpdateAttendanceRequest request) {
        try {
            hasuraClient.updatePatientAttendanceProbability(id, request.probability());
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(NOT_FOUND, ex.getMessage(), ex);
        }
    }

    @PostMapping("/{id}/summaries")
    public ResponseEntity<Void> saveSummary(
            @PathVariable int id,
            @Valid @RequestBody SavePatientSummaryRequest request) {
        try {
            hasuraClient.savePatientSummary(id, request.summary().trim());
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException ex) {
            if (ex.getMessage() != null && ex.getMessage().contains("не найден")) {
                throw new ResponseStatusException(NOT_FOUND, ex.getMessage(), ex);
            }
            throw new ResponseStatusException(BAD_REQUEST, ex.getMessage(), ex);
        }
    }
}
