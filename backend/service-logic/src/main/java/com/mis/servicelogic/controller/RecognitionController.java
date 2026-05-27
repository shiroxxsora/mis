package com.mis.servicelogic.controller;

import com.mis.servicelogic.client.RecognitionClient;
import com.mis.servicelogic.dto.RecognitionRequest;
import com.mis.servicelogic.dto.RecognitionResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/recognition")
public class RecognitionController {

    private final RecognitionClient recognitionClient;

    public RecognitionController(RecognitionClient recognitionClient) {
        this.recognitionClient = recognitionClient;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("service", "service-logic", "status", "UP");
    }

    @PostMapping("/start")
    public ResponseEntity<RecognitionResponse> start(@Valid @RequestBody RecognitionRequest request) {
        RecognitionResponse response = recognitionClient.start(request);
        return ResponseEntity.ok(response);
    }
}
