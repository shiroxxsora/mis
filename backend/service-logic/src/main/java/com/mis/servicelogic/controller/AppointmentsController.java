package com.mis.servicelogic.controller;

import com.mis.servicelogic.client.HasuraClient;
import com.mis.servicelogic.dto.ProcessAppointmentRequest;
import com.mis.servicelogic.exception.AppointmentConflictException;
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
@RequestMapping("/api/appointments")
public class AppointmentsController {

    private final HasuraClient hasuraClient;

    public AppointmentsController(HasuraClient hasuraClient) {
        this.hasuraClient = hasuraClient;
    }

    @PutMapping("/{id}/process")
    public ResponseEntity<Void> process(
            @PathVariable int id,
            @Valid @RequestBody ProcessAppointmentRequest request) {
        try {
            hasuraClient.processAppointment(
                    id,
                    request.status().jsonValue(),
                    blankToNull(request.complaints()),
                    blankToNull(request.notes()),
                    request.treatmentDone()
            );
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException ex) {
            throw mapIllegalArgument(ex);
        } catch (AppointmentConflictException ex) {
            throw mapConflict(ex);
        }
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<Void> cancel(@PathVariable int id) {
        try {
            hasuraClient.cancelAppointment(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException ex) {
            throw mapIllegalArgument(ex);
        } catch (AppointmentConflictException ex) {
            throw mapConflict(ex);
        }
    }

    private static ResponseStatusException mapIllegalArgument(IllegalArgumentException ex) {
        if (ex.getMessage() != null && ex.getMessage().contains("не найден")) {
            return new ResponseStatusException(NOT_FOUND, ex.getMessage(), ex);
        }
        return new ResponseStatusException(BAD_REQUEST, ex.getMessage(), ex);
    }

    private static ResponseStatusException mapConflict(AppointmentConflictException ex) {
        return new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, ex.getMessage(), ex);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
