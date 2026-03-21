package com.mis.kernal.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.mis.kernal.entity.KernalEntity;
import com.mis.kernal.repository.KernalRepository;
import com.mis.kernal.service.KernalService;

@Service
public class KernalServiceImpl implements KernalService {

	private final KernalRepository kernalRepository;

	public KernalServiceImpl(KernalRepository kernalRepository) {
		this.kernalRepository = kernalRepository;
	}

	@Override
	public List<KernalEntity> findAll() {
		return kernalRepository.findAll();
	}

	@Override
	@Transactional
	public KernalEntity create(String name) {
		KernalEntity entity = new KernalEntity();
		entity.setName(name);
		return kernalRepository.save(entity);
	}

}
