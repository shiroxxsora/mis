package com.mis.servicelogic.config;

import com.mis.servicelogic.exception.LlmParseException;
import com.mis.servicelogic.exception.AppointmentConflictException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;

@RestControllerAdvice
public class RecognitionExceptionHandler {

    @ExceptionHandler(HttpStatusCodeException.class)
    ProblemDetail handleDownstream(HttpStatusCodeException ex) {
        String detail = ex.getResponseBodyAsString();
        if (detail == null || detail.isBlank()) {
            detail = ex.getStatusText();
        }
        return ProblemDetail.forStatusAndDetail(ex.getStatusCode(), detail);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail handleUnreadable(HttpMessageNotReadableException ex) {
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                "Некорректный JSON или значение поля: " + ex.getMostSpecificCause().getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                "Некорректный запрос: проверьте переданные поля");
    }

    @ExceptionHandler(ResourceAccessException.class)
    ProblemDetail handleResourceAccess(ResourceAccessException ex) {
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.GATEWAY_TIMEOUT,
                "LLM недоступен или не ответил вовремя: " + ex.getMessage());
    }

    @ExceptionHandler(LlmParseException.class)
    ProblemDetail handleLlmParse(LlmParseException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
    }

    @ExceptionHandler(AppointmentConflictException.class)
    ProblemDetail handleAppointmentConflict(AppointmentConflictException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    ProblemDetail handleIllegalState(IllegalStateException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, ex.getMessage());
    }
}
