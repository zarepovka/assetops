PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS ai_analysis;
DROP TABLE IF EXISTS ticket_history;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS equipment;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS executors;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS app_metadata;

CREATE TABLE app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    department_id INTEGER,
    role TEXT NOT NULL DEFAULT 'employee',
    FOREIGN KEY (department_id) REFERENCES departments(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE TABLE executors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL
);

CREATE TABLE equipment (
    id TEXT PRIMARY KEY,
    inventory TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    department_id INTEGER NOT NULL,
    user_id INTEGER,
    user_label TEXT NOT NULL,
    status TEXT NOT NULL,
    commissioned_at TEXT NOT NULL,
    criticality TEXT NOT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE TABLE tickets (
    id TEXT PRIMARY KEY,
    opened_at TEXT NOT NULL,
    equipment_id TEXT NOT NULL,
    problem_type TEXT NOT NULL,
    category TEXT NOT NULL,
    base_priority TEXT NOT NULL,
    status TEXT NOT NULL,
    executor_id TEXT NOT NULL,
    description TEXT NOT NULL,
    result TEXT NOT NULL,
    FOREIGN KEY (equipment_id) REFERENCES equipment(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (executor_id) REFERENCES executors(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE ticket_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    sequence_no INTEGER NOT NULL,
    event_time TEXT NOT NULL,
    status TEXT NOT NULL,
    actor TEXT NOT NULL,
    comment TEXT NOT NULL,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    UNIQUE (ticket_id, sequence_no)
);

CREATE TABLE ai_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    category TEXT NOT NULL,
    proposed_priority TEXT NOT NULL,
    confidence TEXT NOT NULL,
    rationale_json TEXT NOT NULL,
    recommendations_json TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    related_ticket_id TEXT,
    related_equipment_id TEXT,
    FOREIGN KEY (related_ticket_id) REFERENCES tickets(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    FOREIGN KEY (related_equipment_id) REFERENCES equipment(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE INDEX idx_equipment_department ON equipment(department_id);
CREATE INDEX idx_tickets_equipment ON tickets(equipment_id);
CREATE INDEX idx_tickets_executor ON tickets(executor_id);
CREATE INDEX idx_ticket_history_ticket ON ticket_history(ticket_id);
