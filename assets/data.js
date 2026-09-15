// Synthetic demo dataset; no real people or service incidents.
window.SYSTEM_DATA = {
  "referenceDate": "2026-04-08T10:00:00",
  "enterprise": {
    "name": "AssetOps Demo — вымышленные данные"
  },
  "executors": [
    {
      "id": "exec-01",
      "name": "Демо-инженер 1",
      "role": "Специалист техподдержки"
    },
    {
      "id": "exec-02",
      "name": "Демо-инженер 2",
      "role": "Специалист техподдержки"
    },
    {
      "id": "exec-03",
      "name": "Демо-инженер 3",
      "role": "Специалист техподдержки"
    },
    {
      "id": "exec-04",
      "name": "Демо-инженер 4",
      "role": "Специалист техподдержки"
    }
  ],
  "equipment": [
    {
      "id": "DEMO-001",
      "inventory": "DEMO-001",
      "name": "Демо-устройство 1",
      "type": "ПК",
      "department": "Демо-отдел 1",
      "user": "Демо-пользователь 1",
      "status": "в эксплуатации",
      "commissionedAt": "2024-01-01",
      "criticality": "low"
    },
    {
      "id": "DEMO-002",
      "inventory": "DEMO-002",
      "name": "Демо-устройство 2",
      "type": "Ноутбук",
      "department": "Демо-отдел 2",
      "user": "Демо-пользователь 2",
      "status": "в эксплуатации",
      "commissionedAt": "2024-01-01",
      "criticality": "medium"
    },
    {
      "id": "DEMO-003",
      "inventory": "DEMO-003",
      "name": "Демо-устройство 3",
      "type": "Сетевое оборудование",
      "department": "Демо-отдел 3",
      "user": "Демо-пользователь 3",
      "status": "в эксплуатации",
      "commissionedAt": "2024-01-01",
      "criticality": "high"
    },
    {
      "id": "DEMO-004",
      "inventory": "DEMO-004",
      "name": "Демо-устройство 4",
      "type": "Принтер",
      "department": "Демо-отдел 4",
      "user": "Демо-пользователь 4",
      "status": "в эксплуатации",
      "commissionedAt": "2024-01-01",
      "criticality": "medium"
    },
    {
      "id": "DEMO-005",
      "inventory": "DEMO-005",
      "name": "Демо-устройство 5",
      "type": "ПК",
      "department": "Демо-отдел 1",
      "user": "Демо-пользователь 1",
      "status": "в эксплуатации",
      "commissionedAt": "2024-01-01",
      "criticality": "low"
    },
    {
      "id": "DEMO-006",
      "inventory": "DEMO-006",
      "name": "Демо-устройство 6",
      "type": "Ноутбук",
      "department": "Демо-отдел 2",
      "user": "Демо-пользователь 2",
      "status": "в эксплуатации",
      "commissionedAt": "2024-01-01",
      "criticality": "medium"
    },
    {
      "id": "DEMO-007",
      "inventory": "DEMO-007",
      "name": "Демо-устройство 7",
      "type": "Сетевое оборудование",
      "department": "Демо-отдел 3",
      "user": "Демо-пользователь 3",
      "status": "в эксплуатации",
      "commissionedAt": "2024-01-01",
      "criticality": "high"
    },
    {
      "id": "DEMO-008",
      "inventory": "DEMO-008",
      "name": "Демо-устройство 8",
      "type": "Принтер",
      "department": "Демо-отдел 4",
      "user": "Демо-пользователь 4",
      "status": "в эксплуатации",
      "commissionedAt": "2024-01-01",
      "criticality": "medium"
    }
  ],
  "tickets": [
    {
      "id": "INC-108",
      "openedAt": "2026-04-08T08:00:00",
      "equipmentId": "DEMO-008",
      "problemType": "Замятие бумаги",
      "category": "Периферия",
      "basePriority": "средний",
      "status": "закрыта",
      "executorId": "exec-04",
      "description": "Вымышленный пример: демонстрационный принтер сообщает о замятии бумаги.",
      "result": "Учебная проверка завершена.",
      "history": [
        {
          "time": "2026-04-08T08:00:00",
          "status": "закрыта",
          "actor": "Демо-инженер 4",
          "comment": "Синтетическое событие для демонстрации интерфейса."
        }
      ]
    },
    {
      "id": "INC-107",
      "openedAt": "2026-04-07T08:00:00",
      "equipmentId": "DEMO-007",
      "problemType": "Потеря пакетов",
      "category": "Сеть",
      "basePriority": "высокий",
      "status": "ожидает",
      "executorId": "exec-03",
      "description": "Вымышленный пример: тестовый сетевой узел периодически теряет соединение.",
      "result": "Ожидается учебная диагностика.",
      "history": [
        {
          "time": "2026-04-07T08:00:00",
          "status": "ожидает",
          "actor": "Демо-инженер 3",
          "comment": "Синтетическое событие для демонстрации интерфейса."
        }
      ]
    },
    {
      "id": "INC-106",
      "openedAt": "2026-04-06T08:00:00",
      "equipmentId": "DEMO-006",
      "problemType": "Ошибка запуска приложения",
      "category": "ПО",
      "basePriority": "средний",
      "status": "в работе",
      "executorId": "exec-02",
      "description": "Вымышленный пример: тестовое приложение выдаёт ошибку при запуске.",
      "result": "Ожидается учебная диагностика.",
      "history": [
        {
          "time": "2026-04-06T08:00:00",
          "status": "в работе",
          "actor": "Демо-инженер 2",
          "comment": "Синтетическое событие для демонстрации интерфейса."
        }
      ]
    },
    {
      "id": "INC-105",
      "openedAt": "2026-04-05T08:00:00",
      "equipmentId": "DEMO-005",
      "problemType": "Компьютер не включается",
      "category": "Оборудование",
      "basePriority": "низкий",
      "status": "новая",
      "executorId": "exec-01",
      "description": "Вымышленный пример: после нажатия кнопки питания компьютер не включается.",
      "result": "Ожидается учебная диагностика.",
      "history": [
        {
          "time": "2026-04-05T08:00:00",
          "status": "новая",
          "actor": "Демо-инженер 1",
          "comment": "Синтетическое событие для демонстрации интерфейса."
        }
      ]
    },
    {
      "id": "INC-104",
      "openedAt": "2026-04-04T08:00:00",
      "equipmentId": "DEMO-004",
      "problemType": "Замятие бумаги",
      "category": "Периферия",
      "basePriority": "средний",
      "status": "закрыта",
      "executorId": "exec-04",
      "description": "Вымышленный пример: демонстрационный принтер сообщает о замятии бумаги.",
      "result": "Учебная проверка завершена.",
      "history": [
        {
          "time": "2026-04-04T08:00:00",
          "status": "закрыта",
          "actor": "Демо-инженер 4",
          "comment": "Синтетическое событие для демонстрации интерфейса."
        }
      ]
    },
    {
      "id": "INC-103",
      "openedAt": "2026-04-03T08:00:00",
      "equipmentId": "DEMO-003",
      "problemType": "Потеря пакетов",
      "category": "Сеть",
      "basePriority": "высокий",
      "status": "ожидает",
      "executorId": "exec-03",
      "description": "Вымышленный пример: тестовый сетевой узел периодически теряет соединение.",
      "result": "Ожидается учебная диагностика.",
      "history": [
        {
          "time": "2026-04-03T08:00:00",
          "status": "ожидает",
          "actor": "Демо-инженер 3",
          "comment": "Синтетическое событие для демонстрации интерфейса."
        }
      ]
    },
    {
      "id": "INC-102",
      "openedAt": "2026-04-02T08:00:00",
      "equipmentId": "DEMO-002",
      "problemType": "Ошибка запуска приложения",
      "category": "ПО",
      "basePriority": "средний",
      "status": "в работе",
      "executorId": "exec-02",
      "description": "Вымышленный пример: тестовое приложение выдаёт ошибку при запуске.",
      "result": "Ожидается учебная диагностика.",
      "history": [
        {
          "time": "2026-04-02T08:00:00",
          "status": "в работе",
          "actor": "Демо-инженер 2",
          "comment": "Синтетическое событие для демонстрации интерфейса."
        }
      ]
    },
    {
      "id": "INC-101",
      "openedAt": "2026-04-01T08:00:00",
      "equipmentId": "DEMO-001",
      "problemType": "Компьютер не включается",
      "category": "Оборудование",
      "basePriority": "низкий",
      "status": "новая",
      "executorId": "exec-01",
      "description": "Вымышленный пример: после нажатия кнопки питания компьютер не включается.",
      "result": "Ожидается учебная диагностика.",
      "history": [
        {
          "time": "2026-04-01T08:00:00",
          "status": "новая",
          "actor": "Демо-инженер 1",
          "comment": "Синтетическое событие для демонстрации интерфейса."
        }
      ]
    }
  ]
};
