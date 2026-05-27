package com.mis.servicelogic.service;

import com.mis.servicelogic.config.MinioProperties;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class MinioBucketInitializer implements ApplicationRunner {

    private final MinioStorageService storageService;

    public MinioBucketInitializer(MinioStorageService storageService) {
        this.storageService = storageService;
    }

    @Override
    public void run(ApplicationArguments args) {
        storageService.ensureBucketExists();
    }
}
