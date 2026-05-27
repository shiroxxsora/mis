package com.mis.gateway.config;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Проверяет, что access token выдан для ожидаемого public client (claim {@code azp}).
 */
public class AzpClaimValidator implements OAuth2TokenValidator<Jwt> {

    private final String expectedClientId;

    public AzpClaimValidator(String expectedClientId) {
        this.expectedClientId = expectedClientId;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        String azp = token.getClaimAsString("azp");
        if (expectedClientId.equals(azp)) {
            return OAuth2TokenValidatorResult.success();
        }
        OAuth2Error error = new OAuth2Error(
                "invalid_token",
                "Unexpected azp claim: " + azp,
                null);
        return OAuth2TokenValidatorResult.failure(error);
    }
}
