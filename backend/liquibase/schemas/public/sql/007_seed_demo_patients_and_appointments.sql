-- Demo dataset for visit summarization.
-- 5 patients with 1/3/5/7/10 appointments and detailed visit descriptions.

-- Keep seed deterministic if the SQL is reapplied manually.
DELETE FROM public.appointments
WHERE patient_id BETWEEN 1001 AND 1005;

DELETE FROM public.patients
WHERE id BETWEEN 1001 AND 1005;

INSERT INTO public.patients (id, last_name, first_name, middle_name, birth_date, phone, created_at)
VALUES
    (1001, 'Иванов', 'Павел', 'Андреевич', DATE '1989-04-12', '+79990001001', NOW() - INTERVAL '18 days'),
    (1002, 'Смирнова', 'Екатерина', 'Олеговна', DATE '1993-11-03', '+79990001002', NOW() - INTERVAL '30 days'),
    (1003, 'Кузнецов', 'Дмитрий', 'Сергеевич', DATE '1981-07-22', '+79990001003', NOW() - INTERVAL '45 days'),
    (1004, 'Петрова', 'Анна', 'Викторовна', DATE '1976-02-15', '+79990001004', NOW() - INTERVAL '60 days'),
    (1005, 'Соколова', 'Марина', 'Ильинична', DATE '1968-09-30', '+79990001005', NOW() - INTERVAL '90 days');

-- Patient 1001: 1 appointment
INSERT INTO public.appointments
    (patient_id, scheduled_at, duration_minutes, status, notes, complaints, treatment_done, created_at)
VALUES
    (
        1001,
        NOW() - INTERVAL '10 days',
        45,
        'completed',
        'Первичный осмотр. Выполнена профессиональная гигиена, даны рекомендации по домашнему уходу, подобрана мягкая щетка и ирригатор. Контроль через 6 месяцев.',
        'Кровоточивость десен при чистке, неприятный запах по утрам.',
        true,
        NOW() - INTERVAL '10 days'
    );

-- Patient 1002: 3 appointments
INSERT INTO public.appointments
    (patient_id, scheduled_at, duration_minutes, status, notes, complaints, treatment_done, created_at)
VALUES
    (
        1002,
        NOW() - INTERVAL '25 days',
        40,
        'arrived',
        'Диагностический прием: ОПТГ, фотопротокол, выявлен средний кариес зуба 2.6. Составлен план лечения в 2 посещения.',
        'Чувствительность на холодное слева вверху в течение 2 недель.',
        false,
        NOW() - INTERVAL '25 days'
    ),
    (
        1002,
        NOW() - INTERVAL '18 days',
        60,
        'completed',
        'Проведено лечение кариеса 2.6: инфильтрационная анестезия, препарирование, адгезивный протокол, композитная реставрация с коррекцией окклюзии.',
        'Ноющая боль после сладкого в области 2.6.',
        true,
        NOW() - INTERVAL '18 days'
    ),
    (
        1002,
        NOW() - INTERVAL '7 days',
        30,
        'completed',
        'Контроль после реставрации: контактный пункт и окклюзия без замечаний, чувствительность отсутствует. Рекомендован контроль через 6 месяцев.',
        'Жалоб нет, пришла на контроль.',
        true,
        NOW() - INTERVAL '7 days'
    );

-- Patient 1003: 5 appointments
INSERT INTO public.appointments
    (patient_id, scheduled_at, duration_minutes, status, notes, complaints, treatment_done, created_at)
VALUES
    (
        1003,
        NOW() - INTERVAL '40 days',
        35,
        'completed',
        'Первичный прием, диагностика пародонта: индекс кровоточивости повышен, мягкий налет, локальные пародонтальные карманы до 4 мм.',
        'Кровоточивость и болезненность десны в фронтальном отделе.',
        false,
        NOW() - INTERVAL '40 days'
    ),
    (
        1003,
        NOW() - INTERVAL '33 days',
        55,
        'completed',
        'Проведена профессиональная гигиена обеих челюстей, снятие над- и поддесневых отложений, обучение технике чистки по Басс.',
        'Налет и неприятный запах, усиливается к вечеру.',
        true,
        NOW() - INTERVAL '33 days'
    ),
    (
        1003,
        NOW() - INTERVAL '26 days',
        45,
        'no_show',
        'Пациент не явился. Администратор связался, причина: командировка. Перенос визита согласован.',
        'Планировался контроль заживления десны.',
        false,
        NOW() - INTERVAL '26 days'
    ),
    (
        1003,
        NOW() - INTERVAL '19 days',
        50,
        'completed',
        'Локальная терапия пародонта в области 3.1-3.3 и 4.1-4.3, аппликации антисептика и противовоспалительного геля.',
        'Периодическая болезненность при приеме твердой пищи.',
        true,
        NOW() - INTERVAL '19 days'
    ),
    (
        1003,
        NOW() - INTERVAL '6 days',
        30,
        'arrived',
        'Контрольный осмотр: положительная динамика, кровоточивость уменьшилась, рекомендован поддерживающий визит через 3 месяца.',
        'Незначительная чувствительность в нижних резцах.',
        false,
        NOW() - INTERVAL '6 days'
    );

-- Patient 1004: 7 appointments
INSERT INTO public.appointments
    (patient_id, scheduled_at, duration_minutes, status, notes, complaints, treatment_done, created_at)
VALUES
    (
        1004,
        NOW() - INTERVAL '58 days',
        45,
        'completed',
        'Первичный прием, выраженная стираемость и клиновидные дефекты 1.4, 1.5, 2.4. Составлен этапный план лечения и реминерализации.',
        'Реакция на холодное и кислое, особенно в премолярах.',
        false,
        NOW() - INTERVAL '58 days'
    ),
    (
        1004,
        NOW() - INTERVAL '52 days',
        60,
        'completed',
        'Реставрация клиновидного дефекта 1.4 и 1.5 композитом, проведена шлифовка и полировка. Назначены десенситайзеры.',
        'Острая кратковременная боль при вдыхании холодного воздуха.',
        true,
        NOW() - INTERVAL '52 days'
    ),
    (
        1004,
        NOW() - INTERVAL '45 days',
        35,
        'cancelled',
        'Визит отменен пациентом в день приема из-за ОРВИ, перенесен на следующую неделю.',
        'Планировалась реставрация 2.4.',
        false,
        NOW() - INTERVAL '45 days'
    ),
    (
        1004,
        NOW() - INTERVAL '38 days',
        55,
        'completed',
        'Реставрация 2.4, контроль окклюзии, финишная полировка. Дополнительно герметизация фиссур 1.6 по показаниям.',
        'Дискомфорт при жевании справа.',
        true,
        NOW() - INTERVAL '38 days'
    ),
    (
        1004,
        NOW() - INTERVAL '30 days',
        40,
        'completed',
        'Профилактический прием: фторирование, коррекция гигиены, контроль чувствительности. Рекомендована ночная каппа при бруксизме.',
        'Ночное сжатие зубов, утомляемость жевательных мышц утром.',
        true,
        NOW() - INTERVAL '30 days'
    ),
    (
        1004,
        NOW() - INTERVAL '17 days',
        30,
        'no_show',
        'Пациент не вышел на связь в день приема. Повторный звонок, запись перенесена.',
        'Плановый контроль состояния реставраций.',
        false,
        NOW() - INTERVAL '17 days'
    ),
    (
        1004,
        NOW() - INTERVAL '4 days',
        35,
        'arrived',
        'Контрольный осмотр: реставрации состоятельны, гиперчувствительность снижена. Даны рекомендации по ношению каппы и пасте для чувствительных зубов.',
        'Легкая чувствительность на сладкое в области 2.4.',
        false,
        NOW() - INTERVAL '4 days'
    );

-- Patient 1005: 10 appointments
INSERT INTO public.appointments
    (patient_id, scheduled_at, duration_minutes, status, notes, complaints, treatment_done, created_at)
VALUES
    (
        1005,
        NOW() - INTERVAL '86 days',
        50,
        'completed',
        'Первичный расширенный осмотр, множественные очаги кариеса, хронический периодонтит 4.6 под вопросом. Назначены снимки и этапное лечение.',
        'Периодическая боль при накусывании справа снизу, неприятный вкус.',
        false,
        NOW() - INTERVAL '86 days'
    ),
    (
        1005,
        NOW() - INTERVAL '80 days',
        70,
        'completed',
        'Эндодонтическое лечение 4.6, механическая и медикаментозная обработка каналов, временная пломба с гидроксидом кальция.',
        'Сильная пульсирующая боль в области 4.6, ночные приступы.',
        true,
        NOW() - INTERVAL '80 days'
    ),
    (
        1005,
        NOW() - INTERVAL '73 days',
        65,
        'completed',
        'Продолжение эндодонтии 4.6: контроль проходимости, обтурация каналов, временное восстановление коронки.',
        'Умеренная болезненность при надкусывании.',
        true,
        NOW() - INTERVAL '73 days'
    ),
    (
        1005,
        NOW() - INTERVAL '66 days',
        55,
        'completed',
        'Постэндодонтическое восстановление 4.6: культевая вкладка, подготовка под коронку. Сняты оттиски для лаборатории.',
        'Дискомфорт при жевании твердой пищи на правой стороне.',
        true,
        NOW() - INTERVAL '66 days'
    ),
    (
        1005,
        NOW() - INTERVAL '59 days',
        40,
        'arrived',
        'Примерка временной коронки, проверка краевого прилегания. Назначена дата фиксации постоянной конструкции.',
        'Жалобы на застревание пищи между 4.6 и 4.7.',
        false,
        NOW() - INTERVAL '59 days'
    ),
    (
        1005,
        NOW() - INTERVAL '53 days',
        45,
        'completed',
        'Фиксация постоянной металлокерамической коронки 4.6 на стеклоиономерный цемент, контроль окклюзии.',
        'Периодическая чувствительность при накусывании.',
        true,
        NOW() - INTERVAL '53 days'
    ),
    (
        1005,
        NOW() - INTERVAL '46 days',
        35,
        'cancelled',
        'Пациент отменил прием по семейным обстоятельствам, переписан через 10 дней.',
        'Плановый контроль фиксации коронки.',
        false,
        NOW() - INTERVAL '46 days'
    ),
    (
        1005,
        NOW() - INTERVAL '36 days',
        50,
        'completed',
        'Лечение кариеса 1.7 и 2.7: препарирование, изоляция коффердамом, композитные реставрации, финишная полировка.',
        'Кратковременные боли от сладкого в верхних молярах.',
        true,
        NOW() - INTERVAL '36 days'
    ),
    (
        1005,
        NOW() - INTERVAL '22 days',
        30,
        'no_show',
        'Пациент не явился. Проведен обзвон, согласована новая запись на профилактику.',
        'Планировалась профгигиена и контроль состояния 4.6.',
        false,
        NOW() - INTERVAL '22 days'
    ),
    (
        1005,
        NOW() - INTERVAL '8 days',
        45,
        'arrived',
        'Контрольный визит: состояние 4.6 стабильно, воспалительных изменений нет. Проведена профгигиена и повторный инструктаж по уходу.',
        'Иногда чувство давления в области 4.6 при жевании твердой пищи.',
        true,
        NOW() - INTERVAL '8 days'
    );

-- Keep sequences ahead of seeded IDs.
SELECT setval('public.patients_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.patients), 1005), true);
SELECT setval('public.appointments_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.appointments), true);
