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

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = PatientDataController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(RecognitionExceptionHandler.class)
class PatientDataControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private HasuraClient hasuraClient;

    @BeforeEach
    void stubExistingPatients() {
        when(hasuraClient.patientExists(anyInt())).thenReturn(true);
    }

    @Test
    void updateAttendanceProbability_validRequest_returns204() throws Exception {
        mockMvc.perform(put("/api/patients/42/attendance-probability")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"probability\":75}"))
                .andExpect(status().isNoContent());

        verify(hasuraClient).updatePatientAttendanceProbability(42, 75);
    }

    @Test
    void updateAttendanceProbability_outOfRange_returns400() throws Exception {
        mockMvc.perform(put("/api/patients/1/attendance-probability")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"probability\":101}"))
                .andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.detail")
                        .value("Некорректный запрос: проверьте переданные поля"));
    }

    @Test
    void updateAttendanceProbability_nullValue_returns400() throws Exception {
        mockMvc.perform(put("/api/patients/1/attendance-probability")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"probability\":null}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateAttendanceProbability_negativeValue_returns400() throws Exception {
        mockMvc.perform(put("/api/patients/1/attendance-probability")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"probability\":-1}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void saveSummary_trimsAndPersists() throws Exception {
        mockMvc.perform(post("/api/patients/7/summaries")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"summary\":\"  Краткая сводка  \"}"))
                .andExpect(status().isNoContent());

        verify(hasuraClient).savePatientSummary(7, "Краткая сводка");
    }

    @Test
    void saveSummary_blank_returns400() throws Exception {
        mockMvc.perform(post("/api/patients/7/summaries")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"summary\":\"   \"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void saveSummary_tooLong_returns400() throws Exception {
        String longSummary = "a".repeat(10001);
        mockMvc.perform(post("/api/patients/7/summaries")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("summary", longSummary))))
                .andExpect(status().isBadRequest());
    }
}
