package com.mis.kernal.controller;

import java.util.List;

import com.mis.kernal.entity.KernalEntity;
import com.mis.kernal.service.KernalService;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/kernals")
public class KernalController {

	private final KernalService kernalService;

	public KernalController(KernalService kernalService) {
		this.kernalService = kernalService;
	}

	@GetMapping
	public List<KernalEntity> list() {
		return kernalService.findAll();
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public KernalEntity create(@RequestBody CreateKernalRequest request) {
		return kernalService.create(request.name());
	}

	public record CreateKernalRequest(String name) {
	}

}
