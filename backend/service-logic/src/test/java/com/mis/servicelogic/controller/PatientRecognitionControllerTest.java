package com.mis.servicelogic.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mis.servicelogic.client.HasuraClient;
import com.mis.servicelogic.config.RecognitionExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = PatientRecognitionController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(RecognitionExceptionHandler.class)
class PatientRecognitionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private HasuraClient hasuraClient;

    @BeforeEach
    void setUp() {
        // default stubs per test
    }

    @Test
    void list_returnsSavedRecognitions() throws Exception {
        when(hasuraClient.listPatientRecognitions(7)).thenReturn(List.of(
                new HasuraClient.PatientRecognitionRecord(
                        1, 7, 10, "completed", "ok", "job-1", "caries",
                        0.91, 0.09, null, null, "2026-05-27T00:00:00Z")));

        mockMvc.perform(get("/api/patients/7/recognitions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].label").value("caries"))
                .andExpect(jsonPath("$[0].imageDownloadUrl").value("/api/patients/images/10/file"));
    }

    @Test
    void save_persistsRecognition() throws Exception {
        when(hasuraClient.findPatientImage(10)).thenReturn(
                new HasuraClient.PatientImageRecord(10, 7, "tooth", "patients/7/x.jpg"));
        when(hasuraClient.insertPatientRecognition(
                eq(7), eq(10), eq("completed"), eq("ok"), eq("job-1"), eq("caries"),
                eq(0.91), eq(0.09), isNull(), isNull()))
                .thenReturn(new HasuraClient.PatientRecognitionRecord(
                        2, 7, 10, "completed", "ok", "job-1", "caries",
                        0.91, 0.09, null, null, "2026-05-27T00:00:00Z"));

        mockMvc.perform(post("/api/patients/7/recognitions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "patientImageId": 10,
                                  "status": "completed",
                                  "message": "ok",
                                  "jobId": "job-1",
                                  "label": "caries",
                                  "confidence": 0.91,
                                  "probHealthy": 0.09
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(2))
                .andExpect(jsonPath("$.patientImageId").value(10));

        verify(hasuraClient).requirePatientExists(7);
        verify(hasuraClient).insertPatientRecognition(
                anyInt(), any(), any(), any(), any(), any(), anyDouble(), anyDouble(), any(), any());
    }
}
