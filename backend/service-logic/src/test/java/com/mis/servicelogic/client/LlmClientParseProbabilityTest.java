package com.mis.servicelogic.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mis.servicelogic.exception.LlmParseException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LlmClientParseProbabilityTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @ParameterizedTest
    @CsvSource({
            "Вероятность явки 75%, 75",
            "100%, 100",
            "0%, 0",
            "75, 75",
            " 42 , 42"
    })
    void parseProbability_extractsPercentOrStandaloneNumber(String response, int expected) {
        assertThat(LlmClient.parseProbability(response)).isEqualTo(expected);
    }

    @Test
    void parseProbability_usesLastPercentWhenMultiple() {
        assertThat(LlmClient.parseProbability("10% сначала, итог 80%")).isEqualTo(80);
    }

    @Test
    void parseProbability_clampsAbove100() {
        assertThat(LlmClient.parseProbability("150%")).isEqualTo(100);
    }

    @Test
    void parseProbability_prefersPercentOverPlainNumber() {
        assertThat(LlmClient.parseProbability("Ответ: 10%, альтернативно 90")).isEqualTo(10);
    }

    @Test
    void parseProbability_rejectsProseWithMultipleNumbers() {
        assertThatThrownBy(() -> LlmClient.parseProbability("Пациент посещал клинику 12 раз, оценка 67"))
                .isInstanceOf(LlmParseException.class)
                .hasMessageContaining("ожидается число");
    }

    @Test
    void parseProbability_emptyResponse_throws() {
        assertThatThrownBy(() -> LlmClient.parseProbability("  "))
                .isInstanceOf(LlmParseException.class)
                .hasMessageContaining("пустой ответ");
    }

    @Test
    void parseProbability_nullResponse_throws() {
        assertThatThrownBy(() -> LlmClient.parseProbability(null))
                .isInstanceOf(LlmParseException.class)
                .hasMessageContaining("пустой ответ");
    }

    @Test
    void parseProbability_unparseable_throws() {
        assertThatThrownBy(() -> LlmClient.parseProbability("нет чисел"))
                .isInstanceOf(LlmParseException.class)
                .hasMessageContaining("извлечь вероятность");
    }

    @Test
    void extractOutputText_structuredMessageOnly() throws Exception {
        JsonNode body = MAPPER.readTree("""
                {
                  "output": [
                    {"type": "reasoning", "content": "score 25 maybe 30"},
                    {"type": "message", "content": "\\n\\n20"}
                  ]
                }
                """);

        assertThat(LlmClient.extractOutputText(body)).isEqualTo("20");
        assertThat(LlmClient.parseProbability(LlmClient.extractOutputText(body))).isEqualTo(20);
    }

    @Test
    void extractOutputText_ignoresReasoningOnlyArray() throws Exception {
        JsonNode body = MAPPER.readTree("""
                {
                  "output": [
                    {"type": "reasoning", "content": "final score 20"}
                  ]
                }
                """);

        assertThat(LlmClient.extractOutputText(body)).isEmpty();
    }

    @Test
    void extractOutputText_contentBlocksArray() throws Exception {
        JsonNode body = MAPPER.readTree("""
                {
                  "output": [
                    {
                      "type": "message",
                      "content": [{"type": "text", "text": "75"}]
                    }
                  ]
                }
                """);

        assertThat(LlmClient.extractOutputText(body)).isEqualTo("75");
    }
}
