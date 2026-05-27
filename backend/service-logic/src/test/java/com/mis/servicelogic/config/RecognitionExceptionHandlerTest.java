package com.mis.servicelogic.config;

import com.mis.servicelogic.exception.LlmParseException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.core.MethodParameter;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class RecognitionExceptionHandlerTest {

    private RecognitionExceptionHandler handler;

    @BeforeEach
    void setUp() {
        handler = new RecognitionExceptionHandler();
    }

    @Test
    void handleDownstream_usesResponseBody() {
        var ex = HttpClientErrorException.create(
                HttpStatus.BAD_REQUEST,
                "Bad Request",
                null,
                "{\"detail\":\"invalid payload\"}".getBytes(),
                null);

        ProblemDetail detail = handler.handleDownstream(ex);

        assertThat(detail.getStatus()).isEqualTo(400);
        assertThat(detail.getDetail()).contains("invalid payload");
    }

    @Test
    void handleDownstream_fallsBackToStatusTextWhenBodyIsBlank() {
        var ex = HttpClientErrorException.create(
                HttpStatus.BAD_GATEWAY,
                "Bad Gateway",
                null,
                new byte[0],
                null);

        ProblemDetail detail = handler.handleDownstream(ex);

        assertThat(detail.getStatus()).isEqualTo(502);
        assertThat(detail.getDetail()).isEqualTo("Bad Gateway");
    }

    @Test
    void handleValidation_returnsBadRequest() throws NoSuchMethodException {
        var target = new Object();
        var binding = new BeanPropertyBindingResult(target, "target");
        binding.addError(new FieldError("target", "payload", "must not be blank"));
        Method method = RecognitionExceptionHandlerTest.class
                .getDeclaredMethod("sampleMethod", String.class);
        MethodParameter parameter = new MethodParameter(method, 0);
        var ex = new MethodArgumentNotValidException(parameter, binding);

        ProblemDetail detail = handler.handleValidation(ex);

        assertThat(detail.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(detail.getDetail()).contains("Некорректный запрос");
    }

    @Test
    void handleResourceAccess_returns504() {
        ProblemDetail detail = handler.handleResourceAccess(new ResourceAccessException("timeout"));

        assertThat(detail.getStatus()).isEqualTo(HttpStatus.GATEWAY_TIMEOUT.value());
        assertThat(detail.getDetail()).contains("LLM недоступен");
    }

    @Test
    void handleLlmParse_returns422() {
        ProblemDetail detail = handler.handleLlmParse(new LlmParseException("bad format"));

        assertThat(detail.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY.value());
        assertThat(detail.getDetail()).isEqualTo("bad format");
    }

    @Test
    void handleIllegalState_returns502() {
        ProblemDetail detail = handler.handleIllegalState(new IllegalStateException("Hasura down"));

        assertThat(detail.getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY.value());
        assertThat(detail.getDetail()).isEqualTo("Hasura down");
    }

    @SuppressWarnings("unused")
    private void sampleMethod(String payload) {
        // MethodParameter source for MethodArgumentNotValidException test
    }
}
