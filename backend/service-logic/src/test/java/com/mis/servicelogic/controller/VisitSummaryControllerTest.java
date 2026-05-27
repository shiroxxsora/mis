package com.mis.servicelogic.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mis.servicelogic.client.LlmClient;
import com.mis.servicelogic.config.RecognitionExceptionHandler;
import com.mis.servicelogic.exception.LlmParseException;
import com.mis.servicelogic.dto.VisitSummaryRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = VisitSummaryController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(RecognitionExceptionHandler.class)
class VisitSummaryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private LlmClient llmClient;

    @Test
    void summarize_returnsSummary() throws Exception {
        when(llmClient.summarize(anyString())).thenReturn("Пациент стабилен");

        mockMvc.perform(post("/api/llm/summarize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new VisitSummaryRequest("жалобы на боль"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary").value("Пациент стабилен"));
    }

    @Test
    void attendanceProbability_returnsParsedValue() throws Exception {
        when(llmClient.predictAttendanceProbability(anyString())).thenReturn(82);

        mockMvc.perform(post("/api/llm/attendance-probability")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"input\":\"история визитов\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.probability").value(82));
    }

    @Test
    void summarize_blankInput_returns400() throws Exception {
        mockMvc.perform(post("/api/llm/summarize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"input\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void attendanceProbability_blankInput_returns400() throws Exception {
        mockMvc.perform(post("/api/llm/attendance-probability")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"input\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void attendanceProbability_llmParseError_returns422WithDetail() throws Exception {
        when(llmClient.predictAttendanceProbability(anyString()))
                .thenThrow(new LlmParseException("Неверный формат ответа LLM"));

        mockMvc.perform(post("/api/llm/attendance-probability")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"input\":\"история визитов\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("Неверный формат ответа LLM"));
    }
}
