package com.mis.servicelogic.client;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mis.servicelogic.config.RecognitionServiceProperties;
import com.mis.servicelogic.dto.RecognitionRequest;
import com.mis.servicelogic.dto.RecognitionResponse;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Component
public class RecognitionClient {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public RecognitionClient(RecognitionServiceProperties properties, ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setBufferRequestBody(true);
        requestFactory.setConnectTimeout(Duration.ofSeconds(30));
        requestFactory.setReadTimeout(Duration.ofSeconds(300));

        this.restClient = RestClient.builder()
                .baseUrl(properties.url())
                .requestFactory(requestFactory)
                .build();
    }

    public RecognitionResponse start(RecognitionRequest request) {
        String jsonBody = toJson(request);
        return restClient.post()
                .uri("/api/recognize")
                .contentType(MediaType.APPLICATION_JSON)
                .body(jsonBody)
                .retrieve()
                .body(RecognitionResponse.class);
    }

    private String toJson(RecognitionRequest request) {
        try {
            return objectMapper.writeValueAsString(request);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize recognition request", e);
        }
    }
}
