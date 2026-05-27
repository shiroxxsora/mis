package com.mis.servicelogic.controller;

import com.mis.servicelogic.client.LlmClient;
import com.mis.servicelogic.dto.AttendanceProbabilityRequest;
import com.mis.servicelogic.dto.AttendanceProbabilityResponse;
import com.mis.servicelogic.dto.VisitSummaryRequest;
import com.mis.servicelogic.dto.VisitSummaryResponse;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/llm")
public class VisitSummaryController {

    private static final Logger log = LoggerFactory.getLogger(VisitSummaryController.class);

    private final LlmClient llmClient;

    public VisitSummaryController(LlmClient llmClient) {
        this.llmClient = llmClient;
    }

    @PostMapping("/summarize")
    public ResponseEntity<VisitSummaryResponse> summarize(@Valid @RequestBody VisitSummaryRequest request) {
        String summary = llmClient.summarize(request.input());
        return ResponseEntity.ok(new VisitSummaryResponse(summary));
    }

    @PostMapping("/attendance-probability")
    public ResponseEntity<AttendanceProbabilityResponse> attendanceProbability(
            @Valid @RequestBody AttendanceProbabilityRequest request) {
        log.info("POST /api/llm/attendance-probability, inputLength={}", request.input().length());
        int probability = llmClient.predictAttendanceProbability(request.input());
        return ResponseEntity.ok(new AttendanceProbabilityResponse(probability));
    }
}
