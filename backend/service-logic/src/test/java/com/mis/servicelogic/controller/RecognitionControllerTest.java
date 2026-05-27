package com.mis.servicelogic.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mis.servicelogic.client.RecognitionClient;
import com.mis.servicelogic.config.RecognitionExceptionHandler;
import com.mis.servicelogic.dto.RecognitionRequest;
import com.mis.servicelogic.dto.RecognitionResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.mockito.ArgumentCaptor;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = RecognitionController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(RecognitionExceptionHandler.class)
class RecognitionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private RecognitionClient recognitionClient;

    @Test
    void health_returnsServiceStatus() throws Exception {
        mockMvc.perform(get("/api/recognition/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.service").value("service-logic"))
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void start_delegatesToClient() throws Exception {
        var response = new RecognitionResponse(
                "completed", "Healthy (92%)", "job-1", "Healthy", 0.92, 0.92, "shap-b64", "lime-b64");
        when(recognitionClient.start(any())).thenReturn(response);

        mockMvc.perform(post("/api/recognition/start")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new RecognitionRequest("mis-ui", "base64-image"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.label").value("Healthy"))
                .andExpect(jsonPath("$.jobId").value("job-1"))
                .andExpect(jsonPath("$.shapImageBase64").value("shap-b64"))
                .andExpect(jsonPath("$.limeImageBase64").value("lime-b64"));

        ArgumentCaptor<RecognitionRequest> requestCaptor = ArgumentCaptor.forClass(RecognitionRequest.class);
        verify(recognitionClient).start(requestCaptor.capture());
        RecognitionRequest sent = requestCaptor.getValue();
        org.assertj.core.api.Assertions.assertThat(sent.source()).isEqualTo("mis-ui");
        org.assertj.core.api.Assertions.assertThat(sent.payload()).isEqualTo("base64-image");
    }

    @Test
    void start_blankPayload_returns400() throws Exception {
        mockMvc.perform(post("/api/recognition/start")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"source\":\"mis-ui\",\"payload\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Некорректный запрос: проверьте переданные поля"));
    }
}
