(function () {
  const seedData = cloneData(window.SYSTEM_DATA);
  const data = cloneData(window.SYSTEM_DATA);

  if (!data) {
    return;
  }

  hydrateDataStore();

  let referenceDate = new Date(data.referenceDate);
  const ROLE_PROFILES = {
    admin: {
      role: "admin",
      label: "Администратор",
      name: "Алексей Ковалёв",
      email: "admin@assetops.io",
      avatar: "AK",
      defaultPage: "index.html",
      pages: ["dashboard", "equipment", "tickets", "ticket-detail", "analytics", "notifications", "settings"],
      permissions: [
        "equipment.create",
        "equipment.edit",
        "equipment.bulk",
        "ticket.create",
        "ticket.edit",
        "ticket.close",
        "ticket.bulk",
        "settings.manage",
      ],
    },
    dispatcher: {
      role: "dispatcher",
      label: "Диспетчер",
      name: "Марина Белова",
      email: "dispatcher@assetops.io",
      avatar: "MB",
      defaultPage: "tickets.html",
      pages: ["dashboard", "equipment", "tickets", "ticket-detail", "analytics", "notifications"],
      permissions: ["ticket.create", "ticket.edit", "ticket.close", "ticket.bulk"],
    },
    engineer: {
      role: "engineer",
      label: "Инженер",
      name: "Илья Смирнов",
      email: "engineer@assetops.io",
      avatar: "IS",
      defaultPage: "tickets.html",
      pages: ["dashboard", "equipment", "tickets", "ticket-detail", "analytics", "notifications"],
      permissions: ["ticket.edit", "ticket.close"],
    },
    observer: {
      role: "observer",
      label: "Наблюдатель",
      name: "Анна Волкова",
      email: "observer@assetops.io",
      avatar: "AV",
      defaultPage: "index.html",
      pages: ["dashboard", "equipment", "tickets", "ticket-detail", "analytics", "notifications"],
      permissions: [],
    },
  };
  let runtimeSettings = loadAppSettings();
  let currentUser = loadUserSession();
  let model = buildModel();
  let searchIndex = buildSearchIndex();
  const state = {
    equipmentSelection: new Set(),
    ticketSelection: new Set(),
    settings: runtimeSettings,
    currentUser,
    aiStatus: {
      state: "idle",
      configured: false,
      available: false,
      provider: "AssetOps Local AI",
      model: "",
      error: "",
    },
    aiInsights: loadAiInsights(),
    aiRequestTicketId: "",
    savedViews: loadSavedViews(),
    pageNotice: null,
    recentEquipmentId: "",
    recentTicketId: "",
  };
  let modalReturnFocusNode = null;
  let pendingConfirmAction = null;
  let aiStatusRequest = null;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }

  async function bootstrap() {
    await loadBackendData();
    applyReferenceDate();
    ensureToastLayer();

    if (document.body.dataset.page === "login") {
      initLoginPage();
      return;
    }

    if (!ensurePageAccess()) {
      return;
    }

    renderAppChrome();
    consumeQueuedPageNotice();
    bindModal();
    bindActions();
    bindFormInteractions();
    bindGlobalSearch();
    initPage();
    applyRoleAccessToDom();
    refreshAiStatus();
  }

  async function loadBackendData() {
    const backendData = await fetchBackendData();

    if (!backendData) {
      return;
    }

    Object.assign(seedData, cloneData(backendData));
    Object.assign(data, cloneData(backendData));
    hydrateDataStore();
    referenceDate = new Date(data.referenceDate);
    runtimeSettings = loadAppSettings();
    currentUser = loadUserSession();
    state.settings = runtimeSettings;
    state.currentUser = currentUser;
    model = buildModel();
    searchIndex = buildSearchIndex();
  }

  async function fetchBackendData() {
    if (window.location.protocol === "file:") {
      return null;
    }

    try {
      const response = await fetch("/api/data", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();

      if (!Array.isArray(payload?.equipment) || !Array.isArray(payload?.tickets)) {
        return null;
      }

      return payload;
    } catch (error) {
      return null;
    }
  }

  function initPage() {
    const page = document.body.dataset.page;

    if (page === "dashboard") {
      renderDashboard();
    }

    if (page === "equipment") {
      initEquipmentPage();
    }

    if (page === "tickets") {
      initTicketsPage();
    }

    if (page === "ticket-detail") {
      renderTicketDetail();
    }

    if (page === "analytics") {
      renderAnalytics();
    }

    if (page === "notifications") {
      renderSignalCenter();
    }

    if (page === "settings") {
      renderSettingsPage();
    }
  }

  function initLoginPage() {
    const form = document.getElementById("loginForm");
    const roleNode = document.getElementById("loginRole");
    const emailNode = document.getElementById("loginEmail");
    const noteTitle = document.querySelector("[data-login-role-title]");
    const noteText = document.querySelector("[data-login-role-text]");

    if (!(roleNode instanceof HTMLSelectElement) || !(emailNode instanceof HTMLInputElement)) {
      return;
    }

    const applyRolePreview = () => {
      const profile = getRoleProfile(roleNode.value);
      emailNode.value = profile.email;

      if (noteTitle) {
        noteTitle.textContent = profile.label;
      }

      if (noteText) {
        noteText.textContent = getRoleDescription(profile.role);
      }
    };

    roleNode.value = currentUser.role;
    applyRolePreview();
    roleNode.addEventListener("change", applyRolePreview);

    if (form instanceof HTMLFormElement) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const profile = getRoleProfile(roleNode.value);
        const session = normalizeUserSession({
          role: profile.role,
          email: emailNode.value || profile.email,
        });

        currentUser = session;
        state.currentUser = currentUser;
        writeStorageObject("assetops-user-session", session);
        window.location.href = session.defaultPage;
      });
    }
  }

  function getRoleProfile(role) {
    return ROLE_PROFILES[role] || ROLE_PROFILES.admin;
  }

  function normalizeUserSession(session) {
    const profile = getRoleProfile(session?.role);

    return {
      role: profile.role,
      label: profile.label,
      name: session?.name || profile.name,
      email: session?.email || profile.email,
      avatar: session?.avatar || profile.avatar,
      defaultPage: profile.defaultPage,
      pages: [...profile.pages],
      permissions: [...profile.permissions],
    };
  }

  function loadUserSession() {
    return normalizeUserSession(readStorageObject("assetops-user-session"));
  }

  function getRoleDescription(role) {
    if (role === "dispatcher") {
      return "Работает с очередью заявок, закрытием кейсов и сигналами обработки. Настройки workspace и редактирование техники недоступны.";
    }

    if (role === "engineer") {
      return "Получает доступ к реестру и карточкам заявок, может обновлять и закрывать обращения, но не управляет каталогом и настройками.";
    }

    if (role === "observer") {
      return "Доступен только просмотр дашборда, реестра, заявок, сигналов и аналитики без изменений данных.";
    }

    return "Полный доступ к каталогу техники, сервисной очереди, аналитике, сигналам и настройкам рабочего пространства.";
  }

  function getPageKeyFromHref(href) {
    const value = String(href || "");

    if (!value) {
      return "";
    }

    const normalized = value.split("?")[0];

    if (normalized.endsWith("index.html")) {
      return "dashboard";
    }

    if (normalized.endsWith("equipment.html")) {
      return "equipment";
    }

    if (normalized.endsWith("tickets.html")) {
      return "tickets";
    }

    if (normalized.endsWith("ticket-detail.html")) {
      return "ticket-detail";
    }

    if (normalized.endsWith("analytics.html")) {
      return "analytics";
    }

    if (normalized.endsWith("notifications.html")) {
      return "notifications";
    }

    if (normalized.endsWith("settings.html")) {
      return "settings";
    }

    if (normalized.endsWith("login.html")) {
      return "login";
    }

    return "";
  }

  function getPageLabel(page) {
    return (
      {
        dashboard: "Главная панель",
        equipment: "Техника",
        tickets: "Заявки",
        "ticket-detail": "Карточка заявки",
        analytics: "Аналитика",
        notifications: "Сигналы",
        settings: "Настройки",
      }[page] || page
    );
  }

  function canAccessPage(page) {
    if (!page || page === "login") {
      return true;
    }

    return currentUser.pages.includes(page);
  }

  function hasPermission(permission) {
    return currentUser.permissions.includes(permission);
  }

  function ensurePageAccess() {
    const page = document.body.dataset.page;

    if (canAccessPage(page)) {
      return true;
    }

    queuePageNotice({
      page: getPageKeyFromHref(currentUser.defaultPage),
      kicker: "role access",
      title: "Раздел недоступен для выбранной роли",
      text: `${currentUser.label} не имеет доступа к разделу «${getPageLabel(page)}».`,
      tone: "info",
    });
    window.location.href = currentUser.defaultPage;
    return false;
  }

  function applyRoleAccessToDom() {
    document.querySelectorAll(".topnav__link").forEach((node) => {
      const page = getPageKeyFromHref(node.getAttribute("href"));
      node.hidden = !!page && !canAccessPage(page);
    });

    document.querySelectorAll('[data-action="add-equipment"]').forEach((node) => {
      node.hidden = !hasPermission("equipment.create");
    });

    document.querySelectorAll("[data-equipment-edit]").forEach((node) => {
      node.hidden = !hasPermission("equipment.edit");
    });

    document.querySelectorAll('[data-action="create-ticket"]').forEach((node) => {
      node.hidden = !hasPermission("ticket.create");
    });

    document.querySelectorAll("[data-ticket-edit]").forEach((node) => {
      node.hidden = !hasPermission("ticket.edit");
    });

    document.querySelectorAll('[data-action="close-ticket"]').forEach((node) => {
      node.hidden = !hasPermission("ticket.close");
    });

    document.querySelectorAll('[data-action="save-settings"], [data-action="reset-settings"]').forEach((node) => {
      node.hidden = !hasPermission("settings.manage");
    });

    document
      .querySelectorAll(
        '[data-action="equipment-bulk-service"], [data-action="equipment-bulk-repair"], [data-action="clear-equipment-selection"], [data-select-all-equipment], [data-select-equipment]'
      )
      .forEach((node) => {
        if ("disabled" in node) {
          node.disabled = !hasPermission("equipment.bulk");
        }
        node.hidden = !hasPermission("equipment.bulk");
      });

    document
      .querySelectorAll(
        '[data-action="ticket-bulk-priority"], [data-action="ticket-bulk-assign"], [data-action="ticket-bulk-close"], [data-action="clear-ticket-selection"], [data-select-all-ticket], [data-select-ticket]'
      )
      .forEach((node) => {
        if ("disabled" in node) {
          node.disabled = !hasPermission("ticket.bulk");
        }
        node.hidden = !hasPermission("ticket.bulk");
      });
  }

  function guardPermission(permission, title, text) {
    if (hasPermission(permission)) {
      return true;
    }

    notify({
      tone: "info",
      title: title || "Доступ ограничен",
      text:
        text ||
        `${currentUser.label} работает в режиме с ограниченными правами и не может выполнять это действие.`,
    });
    return false;
  }

  function buildModel() {
    const repeatedThreshold = Math.max(
      2,
      Number(runtimeSettings.autoPriority.repeatedIncidentThreshold) || 2
    );
    const equipmentById = new Map(data.equipment.map((item) => [item.id, item]));
    const executorById = new Map(data.executors.map((item) => [item.id, item]));
    const incidentCountByEquipment = data.tickets.reduce((acc, item) => {
      acc[item.equipmentId] = (acc[item.equipmentId] || 0) + 1;
      return acc;
    }, {});

    const equipment = data.equipment.map((item) => {
      const age = yearsInService(item.commissionedAt);
      const incidentCount = incidentCountByEquipment[item.id] || 0;
      const recommendation = getEquipmentRecommendation(item, incidentCount, age);
      const problematic =
        incidentCount >= repeatedThreshold ||
        item.status === "в ремонте" ||
        (age >= 6 && item.status !== "списано");

      return {
        ...item,
        age,
        incidentCount,
        recommendation,
        problematic,
      };
    });

    const enrichedEquipmentById = new Map(equipment.map((item) => [item.id, item]));

    const tickets = data.tickets
      .map((item) =>
        enrichTicket(
          item,
          enrichedEquipmentById.get(item.equipmentId),
          executorById.get(item.executorId),
          incidentCountByEquipment[item.equipmentId] || 0
        )
      )
      .sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));

    const equipmentStatusBreakdown = ["в эксплуатации", "на обслуживании", "в ремонте", "списано"].map(
      (status) => ({
        label: capitalize(status),
        value: equipment.filter((item) => item.status === status).length,
      })
    );

    const categoryBreakdown = toBreakdown(tickets, "category");
    const monthlyTrend = buildMonthlyTrend(tickets);

    const problemEquipment = equipment
      .filter((item) => item.problematic)
      .sort((a, b) => {
        if (b.incidentCount !== a.incidentCount) {
          return b.incidentCount - a.incidentCount;
        }
        if (a.status !== b.status) {
          return a.status === "в ремонте" ? -1 : 1;
        }
        return b.age - a.age;
      });

    const workload = data.executors.map((executor) => {
      const assigned = tickets.filter((item) => item.executorId === executor.id);
      const active = assigned.filter((item) => item.isActive).length;
      const closed = assigned.filter((item) => item.status === "закрыта").length;
      const overdue = assigned.filter((item) => item.status === "просрочена").length;
      const load = Math.min(95, active * 24 + overdue * 18 + closed * 6);

      return {
        name: executor.name,
        role: executor.role,
        active,
        closed,
        overdue,
        load,
      };
    });

    const closedTickets = tickets.filter((item) => item.closedAt);
    const averageResolutionHours = closedTickets.length
      ? closedTickets.reduce((sum, item) => sum + item.resolutionHours, 0) / closedTickets.length
      : 0;

    return {
      equipment,
      tickets,
      equipmentStatusBreakdown,
      categoryBreakdown,
      monthlyTrend,
      problemEquipment,
      workload,
      averageResolutionHours,
    };
  }

  function buildSearchIndex() {
    const moduleItems = [
      {
        group: "Разделы",
        kind: "link",
        title: "Главная панель",
        text: "Сводные KPI, рекомендации, фокус смены и быстрые действия.",
        meta: "Dashboard",
        href: "index.html",
        badge: "модуль",
        tone: "info",
        weight: 130,
        featured: true,
        keywords: "главная панель дашборд dashboard control room overview сводка",
      },
      {
        group: "Разделы",
        kind: "link",
        title: "Реестр техники",
        text: "Каталог активов, фильтры по подразделениям, состояниям и watchlist техники.",
        meta: "Asset Registry",
        href: "equipment.html",
        badge: "модуль",
        tone: "info",
        weight: 126,
        featured: true,
        keywords: "техника оборудование активы реестр каталог registry asset",
      },
      {
        group: "Разделы",
        kind: "link",
        title: "Заявки и инциденты",
        text: "Очередь обращений, SLA-контроль, диспетчерский обзор и исполнители.",
        meta: "Service Desk",
        href: "tickets.html",
        badge: "модуль",
        tone: "watch",
        weight: 124,
        featured: true,
        keywords: "заявки инциденты service desk обращения очередь ticket",
      },
      {
        group: "Разделы",
        kind: "link",
        title: "Центр сигналов",
        text: "Единая очередь событий, watchlist активов и приоритетные действия для команды.",
        meta: "Signal Center",
        href: "notifications.html",
        badge: "модуль",
        tone: "critical",
        weight: 128,
        featured: true,
        keywords: "сигналы signal center уведомления события alerts notifications",
      },
      {
        group: "Разделы",
        kind: "link",
        title: "Аналитика",
        text: "Категории заявок, состояние техники, проблемные активы и загрузка команды.",
        meta: "Analytics",
        href: "analytics.html",
        badge: "модуль",
        tone: "ok",
        weight: 122,
        featured: true,
        keywords: "аналитика dashboard report analytics отчеты метрики",
      },
      {
        group: "Разделы",
        kind: "link",
        title: "Настройки workspace",
        text: "Правила автоприоритета, SLA-пороги, сигналы и параметры рабочего пространства.",
        meta: "Settings",
        href: "settings.html",
        badge: "модуль",
        tone: "info",
        weight: 119,
        featured: true,
        keywords: "настройки settings workspace sla правила сигналы policy",
      },
    ];

    const actionItems = [
      {
        group: "Команды",
        kind: "action",
        title: "Добавить технику",
        text: "Открыть карточку постановки оборудования на учет и включить актив в каталог.",
        meta: "Asset Registry",
        action: "add-equipment",
        badge: "команда",
        tone: "info",
        weight: 118,
        featured: true,
        keywords: "добавить технику оборудование актив создать устройство",
      },
      {
        group: "Команды",
        kind: "action",
        title: "Создать заявку",
        text: "Запустить новый цикл обработки обращения и включить кейс в SLA-контур.",
        meta: "Service Desk",
        action: "create-ticket",
        badge: "команда",
        tone: "watch",
        weight: 120,
        featured: true,
        keywords: "создать заявку инцидент обращение ticket new incident",
      },
      {
        group: "Команды",
        kind: "link",
        title: "Открыть проблемные активы",
        text: "Перейти к watchlist техники с повторными инцидентами и ремонтными рисками.",
        meta: "Signal Center",
        href: "notifications.html",
        badge: "маршрут",
        tone: "critical",
        weight: 112,
        featured: true,
        keywords: "watchlist проблемные активы сигналы риски техника",
      },
      {
        group: "Команды",
        kind: "link",
        title: "Проверить загрузку команды",
        text: "Открыть аналитику по исполнителям, активной очереди и коэффициенту закрытия.",
        meta: "Analytics",
        href: "analytics.html",
        badge: "маршрут",
        tone: "ok",
        weight: 108,
        featured: true,
        keywords: "загрузка команда исполнители workload analytics",
      },
    ];

    const equipmentItems = model.equipment.map((item) => ({
      group: "Техника",
      kind: "equipment",
      title: `${item.inventory} • ${item.name}`,
      text: `${item.department} • ${item.user}`,
      meta: `${item.type} • ${item.status}`,
      equipmentId: item.id,
      badge: item.status,
      tone:
        item.status === "в ремонте"
          ? "critical"
          : item.status === "на обслуживании"
            ? "watch"
            : item.status === "списано"
              ? "ok"
              : item.problematic
                ? "info"
                : "ok",
      weight: item.problematic ? 102 : 70,
      featured: item.problematic,
      keywords: `${item.recommendation.short} ${item.recommendation.text} ${item.type} ${item.department}`,
    }));

    const ticketItems = model.tickets.map((item) => ({
      group: "Заявки",
      kind: "link",
      title: `${item.id} • ${item.problemType}`,
      text: `${item.equipment.inventory} • ${item.executor.name}`,
      meta: `${item.priority} • ${item.status}`,
      href: `ticket-detail.html?id=${encodeURIComponent(item.id)}`,
      badge: item.status,
      tone:
        item.status === "просрочена"
          ? "critical"
          : item.priority === "критический"
            ? "watch"
            : item.autoRaised
              ? "info"
              : "ok",
      weight:
        item.status === "просрочена" ? 116 : item.priority === "критический" ? 110 : item.isActive ? 86 : 68,
      featured: item.status === "просрочена" || item.priority === "критический",
      keywords: `${item.category} ${item.description} ${item.result} ${item.equipment.department} ${item.equipment.name}`,
    }));

    const executorItems = model.workload.map((item) => ({
      group: "Команда",
      kind: "link",
      title: item.name,
      text: item.role,
      meta: `${item.active} активных • ${item.overdue} просрочено • ${item.load}%`,
      href: "analytics.html",
      badge: "исполнитель",
      tone: item.load >= 80 ? "critical" : item.load >= 60 ? "watch" : "ok",
      weight: item.load >= 80 ? 100 : 74,
      featured: item.load >= 70,
      keywords: `${item.role} исполнители нагрузка workload active overdue`,
    }));

    const signalItems = getSignalCenterItems().map((item) => ({
      group: "Сигналы",
      kind: "link",
      title: item.title,
      text: item.text,
      meta: item.meta,
      href: item.actionHref,
      badge: item.source,
      tone: item.tone,
      weight:
        item.tone === "critical" ? 125 : item.tone === "watch" ? 106 : item.tone === "info" ? 92 : 76,
      featured: true,
      keywords: `${item.context} ${item.source} ${item.actionLabel}`,
    }));

    return [
      ...moduleItems.filter((item) => canAccessPage(getPageKeyFromHref(item.href))),
      ...actionItems.filter((item) =>
        item.kind === "action"
          ? (item.action === "add-equipment" && hasPermission("equipment.create")) ||
            (item.action === "create-ticket" && hasPermission("ticket.create"))
          : canAccessPage(getPageKeyFromHref(item.href))
      ),
      ...signalItems.filter((item) => canAccessPage(getPageKeyFromHref(item.href))),
      ...ticketItems.filter((item) => canAccessPage("ticket-detail")),
      ...equipmentItems.filter((item) => canAccessPage("equipment")),
      ...executorItems.filter((item) => canAccessPage(getPageKeyFromHref(item.href))),
    ].map(prepareSearchEntry);
  }

  function enrichTicket(ticket, equipment, executor, incidentCount) {
    const basePriorityScore = {
      низкий: 1,
      средний: 2,
      высокий: 3,
    }[ticket.basePriority] || 2;
    const repeatedThreshold = Math.max(
      2,
      Number(runtimeSettings.autoPriority.repeatedIncidentThreshold) || 2
    );

    let score = basePriorityScore;
    const reasons = [];

    if (runtimeSettings.autoPriority.criticalityBoost && equipment.criticality === "high") {
      score += 1;
      reasons.push("техника относится к критичной инфраструктуре");
    }

    if (
      runtimeSettings.autoPriority.infrastructureBoost &&
      (ticket.category === "Сеть" || ticket.category === "Сервер")
    ) {
      score += 1;
      reasons.push("инцидент влияет на сетевые или серверные сервисы");
    }

    if (
      runtimeSettings.autoPriority.productionBoost &&
      equipment.department === "Производственный отдел"
    ) {
      score += 1;
      reasons.push("неисправность затрагивает критичный рабочий процесс");
    }

    if (
      runtimeSettings.autoPriority.repeatedIncidentsBoost &&
      incidentCount >= repeatedThreshold
    ) {
      score += 1;
      reasons.push("по данной единице техники уже фиксировались повторные инциденты");
    }

    if (runtimeSettings.autoPriority.overdueBoost && ticket.status === "просрочена") {
      score += 1;
      reasons.push("превышен нормативный срок обработки заявки");
    }

    score = Math.min(score, 4);

    const closedEvent = ticket.history.find((item) => item.status === "закрыта");
    const finalPriority = {
      1: "низкий",
      2: "средний",
      3: "высокий",
      4: "критический",
    }[score];
    const slaTargetHours =
      finalPriority === "критический"
        ? Number(runtimeSettings.sla.criticalHours)
        : finalPriority === "высокий"
          ? Number(runtimeSettings.sla.highHours)
          : Number(runtimeSettings.sla.standardHours);
    const elapsedHours = hoursBetween(ticket.openedAt, referenceDate.toISOString());
    const slaConsumedPercent = slaTargetHours
      ? Math.round((elapsedHours / Math.max(1, slaTargetHours)) * 100)
      : 0;

    return {
      ...ticket,
      equipment,
      executor,
      priority: finalPriority,
      autoRaised: score > basePriorityScore,
      priorityReasons: reasons.length ? reasons : ["приоритет соответствует базовой классификации"],
      isActive: ticket.status !== "закрыта",
      closedAt: closedEvent ? closedEvent.time : null,
      resolutionHours: closedEvent ? hoursBetween(ticket.openedAt, closedEvent.time) : 0,
      elapsedHours,
      slaTargetHours,
      slaConsumedPercent,
      isNearSla:
        ticket.status !== "закрыта" &&
        ticket.status !== "просрочена" &&
        slaConsumedPercent >= Number(runtimeSettings.sla.warningThreshold),
    };
  }

  function renderDashboard() {
    renderPageNotice();
    const notificationItems = getNotificationItems();

    renderSignalRibbon("dashboardMetrics", [
      {
        label: "Средств вычислительной техники",
        value: model.equipment.length,
        hint: "зарегистрировано в едином реестре",
        tone: "ink",
      },
      {
        label: "Активные заявки",
        value: model.tickets.filter((item) => item.isActive).length,
        hint: "новые, в работе, ожидают и просроченные",
        tone: "accent",
      },
      {
        label: "Техника в ремонте",
        value: model.equipment.filter((item) => item.status === "в ремонте").length,
        hint: "требует восстановления или замены",
        tone: "amber",
      },
      {
        label: "Просроченные заявки",
        value: model.tickets.filter((item) => item.status === "просрочена").length,
        hint: "на приоритетном контроле диспетчера",
        tone: "red",
      },
    ]);

    document.getElementById("dashboardFocus").innerHTML = renderFocusCards(getFocusItems());
    document.getElementById("ticketTrendChart").innerHTML = renderTrendChart(model.monthlyTrend);
    document.getElementById("equipmentStatusChart").innerHTML = renderDonutChart(
      model.equipmentStatusBreakdown,
      "ед. техники"
    );
    document.getElementById("recommendationList").innerHTML = renderRecommendations(
      getRecommendationItems()
    );
    document.getElementById("hotEquipmentList").innerHTML = renderAssetCards(
      model.problemEquipment.slice(0, 4)
    );
    document.getElementById("quickActionGrid").innerHTML = renderQuickActions(getQuickActions());
    document.getElementById("notificationFeed").innerHTML = renderNotifications(notificationItems);
    document.getElementById("onboardingGrid").innerHTML = renderOnboarding(getOnboardingItems());
  }

  function initEquipmentPage() {
    const typeNode = document.getElementById("equipmentTypeFilter");
    const departmentNode = document.getElementById("equipmentDepartmentFilter");
    const statusNode = document.getElementById("equipmentStatusFilter");

    fillSelect(typeNode, uniqueValues(model.equipment, "type"), "Все типы");
    fillSelect(departmentNode, uniqueValues(model.equipment, "department"), "Все подразделения");
    fillSelect(
      statusNode,
      ["в эксплуатации", "на обслуживании", "в ремонте", "списано"],
      "Все состояния"
    );

    [typeNode, departmentNode, statusNode].forEach((node) => {
      node.addEventListener("change", renderEquipmentPage);
    });

    document.getElementById("resetEquipmentFilters").addEventListener("click", () => {
      typeNode.value = "";
      departmentNode.value = "";
      statusNode.value = "";
      renderEquipmentPage();
    });

    renderEquipmentPage();
  }

  function getCurrentEquipmentFilters() {
    return {
      type: document.getElementById("equipmentTypeFilter")?.value || "",
      department: document.getElementById("equipmentDepartmentFilter")?.value || "",
      status: document.getElementById("equipmentStatusFilter")?.value || "",
    };
  }

  function getFilteredEquipmentRows() {
    const filters = getCurrentEquipmentFilters();

    return model.equipment
      .filter((item) => !filters.type || item.type === filters.type)
      .filter((item) => !filters.department || item.department === filters.department)
      .filter((item) => !filters.status || item.status === filters.status)
      .sort((a, b) => {
        if (a.problematic !== b.problematic) {
          return Number(b.problematic) - Number(a.problematic);
        }

        return a.inventory.localeCompare(b.inventory, "ru");
      });
  }

  function renderEquipmentPage() {
    if (!hasPermission("equipment.bulk")) {
      state.equipmentSelection.clear();
    }

    renderPageNotice();
    renderSignalRibbon("equipmentMetrics", [
      {
        label: "В эксплуатации",
        value: model.equipment.filter((item) => item.status === "в эксплуатации").length,
        hint: "основной рабочий фонд",
        tone: "green",
      },
      {
        label: "На обслуживании",
        value: model.equipment.filter((item) => item.status === "на обслуживании").length,
        hint: "плановые сервисные работы",
        tone: "amber",
      },
      {
        label: "В ремонте",
        value: model.equipment.filter((item) => item.status === "в ремонте").length,
        hint: "на контроле сервисной команды",
        tone: "red",
      },
      {
        label: "Проблемные единицы",
        value: model.problemEquipment.length,
        hint: "частые инциденты или высокий износ",
        tone: "blue",
      },
    ]);

    const watchlistNode = document.getElementById("equipmentWatchlist");
    const insightNode = document.getElementById("equipmentModuleInsights");
    const savedViewsNode = document.getElementById("equipmentSavedViews");
    const bulkNode = document.getElementById("equipmentBulkBar");
    const summaryNode = document.getElementById("equipmentToolbarSummary");

    if (watchlistNode) {
      watchlistNode.innerHTML =
        renderAssetCards(model.problemEquipment.slice(0, 3)) ||
        renderEmptyState({
          kicker: "watchlist пуста",
          title: "Активы высокого риска не обнаружены",
          text: "Система не видит устройств с повторяющимися инцидентами, критичным износом или активным ремонтом.",
        });
    }

    if (insightNode) {
      insightNode.innerHTML = renderInsightCards(getEquipmentModuleInsights());
    }

    const rows = getFilteredEquipmentRows();
    trimSelection(state.equipmentSelection, rows.map((item) => item.id));

    if (summaryNode) {
      summaryNode.innerHTML = renderEquipmentToolbarSummary(rows);
    }

    if (savedViewsNode) {
      savedViewsNode.innerHTML = renderSavedViews("equipment", getCurrentEquipmentFilters());
    }

    if (bulkNode) {
      bulkNode.innerHTML = hasPermission("equipment.bulk") ? renderEquipmentBulkBar(rows) : "";
    }

    const body = document.getElementById("equipmentTableBody");
    const selectAllNode = document.getElementById("selectAllEquipmentRows");

    if (selectAllNode) {
      selectAllNode.checked = !!rows.length && rows.every((item) => state.equipmentSelection.has(item.id));
      selectAllNode.indeterminate =
        state.equipmentSelection.size > 0 &&
        rows.some((item) => state.equipmentSelection.has(item.id)) &&
        !selectAllNode.checked;
    }

    if (!rows.length) {
      body.innerHTML = `
        <tr>
          <td colspan="9">
            ${renderEmptyState({
              kicker: "реестр пуст по фильтру",
              title: "Подходящие устройства не найдены",
              text: "Измените параметры фильтрации или вернитесь к полному реестру, чтобы продолжить работу с оборудованием.",
              actions: `
                <button class="button" type="button" data-action="reset-equipment-empty">Сбросить фильтры</button>
                ${
                  hasAvailableDraft("equipment")
                    ? '<button class="button" type="button" data-action="resume-equipment-draft">Продолжить черновик</button>'
                    : ""
                }
                ${
                  hasPermission("equipment.create")
                    ? '<button class="button button--primary" type="button" data-action="add-equipment">Добавить технику</button>'
                    : ""
                }
              `,
            })}
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = rows
      .map((item) => {
        const rowClass = [item.problematic ? "problem-row" : "", item.id === state.recentEquipmentId ? "is-recent-row" : ""]
          .filter(Boolean)
          .join(" ");

        return `
          <tr class="${rowClass}">
            <td class="table-check-cell">
              <input
                class="table-check"
                type="checkbox"
                data-select-equipment="${item.id}"
                aria-label="Выбрать ${escapeAttribute(item.inventory)}"
                ${state.equipmentSelection.has(item.id) ? "checked" : ""}
              />
            </td>
            <td>
              <div class="cell-stack">
                <strong>${escapeHtml(item.inventory)}</strong>
                <small>${item.problematic ? "требует внимания" : "штатный контроль"}</small>
              </div>
            </td>
            <td>
              <div class="cell-stack">
                <strong>${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(item.recommendation.short)}</small>
              </div>
            </td>
            <td>${escapeHtml(item.type)}</td>
            <td>${escapeHtml(item.department)}</td>
            <td>${escapeHtml(item.user)}</td>
            <td>${equipmentStatusBadge(item.status)}</td>
            <td>${formatDate(item.commissionedAt)}</td>
            <td>
              <div class="table-actions">
                <button class="table-button" type="button" data-equipment-view="${item.id}">Просмотр</button>
                ${
                  hasPermission("equipment.edit")
                    ? `<button class="table-button" type="button" data-equipment-edit="${item.id}">Редактировать</button>`
                    : ""
                }
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function initTicketsPage() {
    const statusNode = document.getElementById("ticketStatusFilter");
    const priorityNode = document.getElementById("ticketPriorityFilter");
    const executorNode = document.getElementById("ticketExecutorFilter");

    fillSelect(
      statusNode,
      ["новая", "в работе", "ожидает", "закрыта", "просрочена"],
      "Все статусы"
    );
    fillSelect(
      priorityNode,
      ["низкий", "средний", "высокий", "критический"],
      "Все приоритеты"
    );
    fillSelect(
      executorNode,
      model.workload.map((item) => item.name),
      "Все исполнители"
    );

    [statusNode, priorityNode, executorNode].forEach((node) => {
      node.addEventListener("change", renderTicketsPage);
    });

    document.getElementById("resetTicketFilters").addEventListener("click", () => {
      statusNode.value = "";
      priorityNode.value = "";
      executorNode.value = "";
      renderTicketsPage();
    });

    renderTicketsPage();
  }

  function getCurrentTicketFilters() {
    return {
      status: document.getElementById("ticketStatusFilter")?.value || "",
      priority: document.getElementById("ticketPriorityFilter")?.value || "",
      executor: document.getElementById("ticketExecutorFilter")?.value || "",
    };
  }

  function getFilteredTicketRows() {
    const filters = getCurrentTicketFilters();

    return model.tickets
      .filter((item) => !filters.status || item.status === filters.status)
      .filter((item) => !filters.priority || item.priority === filters.priority)
      .filter((item) => !filters.executor || item.executor.name === filters.executor);
  }

  function renderTicketsPage() {
    if (!hasPermission("ticket.bulk")) {
      state.ticketSelection.clear();
    }

    renderPageNotice();
    renderSignalRibbon("ticketMetrics", [
      {
        label: "Новые заявки",
        value: model.tickets.filter((item) => item.status === "новая").length,
        hint: "ожидают первичной обработки",
        tone: "blue",
      },
      {
        label: "В работе",
        value: model.tickets.filter((item) => item.status === "в работе").length,
        hint: "уже назначены исполнителям",
        tone: "accent",
      },
      {
        label: "Ожидают",
        value: model.tickets.filter((item) => item.status === "ожидает").length,
        hint: "зависят от окна работ или поставки",
        tone: "amber",
      },
      {
        label: "Критический приоритет",
        value: model.tickets.filter((item) => item.priority === "критический").length,
        hint: "усиленные системой обращения",
        tone: "red",
      },
    ]);

    const dispatchNode = document.getElementById("ticketDispatchInsights");
    const signalNode = document.getElementById("ticketSignalFeed");
    const savedViewsNode = document.getElementById("ticketSavedViews");
    const bulkNode = document.getElementById("ticketBulkBar");
    const summaryNode = document.getElementById("ticketToolbarSummary");

    if (dispatchNode) {
      dispatchNode.innerHTML = renderInsightCards(getTicketDispatchInsights());
    }

    if (signalNode) {
      signalNode.innerHTML = renderNotifications(getTicketSignalItems());
    }

    const rows = getFilteredTicketRows();
    trimSelection(state.ticketSelection, rows.map((item) => item.id));

    if (summaryNode) {
      summaryNode.innerHTML = renderTicketToolbarSummary(rows);
    }

    if (savedViewsNode) {
      savedViewsNode.innerHTML = renderSavedViews("tickets", getCurrentTicketFilters());
    }

    if (bulkNode) {
      bulkNode.innerHTML = hasPermission("ticket.bulk") ? renderTicketBulkBar(rows) : "";
    }

    const body = document.getElementById("ticketTableBody");
    const selectAllNode = document.getElementById("selectAllTicketRows");

    if (selectAllNode) {
      selectAllNode.checked = !!rows.length && rows.every((item) => state.ticketSelection.has(item.id));
      selectAllNode.indeterminate =
        state.ticketSelection.size > 0 &&
        rows.some((item) => state.ticketSelection.has(item.id)) &&
        !selectAllNode.checked;
    }

    if (!rows.length) {
      body.innerHTML = `
        <tr>
          <td colspan="9">
            ${renderEmptyState({
              kicker: "очередь пуста по фильтру",
              title: "Заявки с заданными условиями не найдены",
              text: "Сбросьте фильтры или создайте новое обращение, если требуется зарегистрировать инцидент вручную.",
              actions: `
                <button class="button" type="button" data-action="reset-ticket-empty">Сбросить фильтры</button>
                ${
                  hasAvailableDraft("ticket")
                    ? '<button class="button" type="button" data-action="resume-ticket-draft">Продолжить черновик</button>'
                    : ""
                }
                ${
                  hasPermission("ticket.create")
                    ? '<button class="button button--primary" type="button" data-action="create-ticket">Создать заявку</button>'
                    : ""
                }
              `,
            })}
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = rows
      .map((item) => {
        const rowClass = item.id === state.recentTicketId ? "is-recent-row" : "";

        return `
          <tr class="${rowClass}">
            <td class="table-check-cell">
              <input
                class="table-check"
                type="checkbox"
                data-select-ticket="${item.id}"
                aria-label="Выбрать ${escapeAttribute(item.id)}"
                ${state.ticketSelection.has(item.id) ? "checked" : ""}
              />
            </td>
            <td>
              <div class="cell-stack">
                <strong>${escapeHtml(item.id)}</strong>
                <small>${item.autoRaised ? "приоритет повышен системой" : "стандартная классификация"}</small>
              </div>
            </td>
            <td>${formatDate(item.openedAt)}</td>
            <td>
              <div class="cell-stack">
                <strong>${escapeHtml(item.equipment.inventory)}</strong>
                <small>${escapeHtml(item.equipment.name)}</small>
              </div>
            </td>
            <td>
              <div class="cell-stack">
                <strong>${escapeHtml(item.problemType)}</strong>
                <small>${escapeHtml(item.category)}</small>
              </div>
            </td>
            <td>${priorityBadge(item.priority)}</td>
            <td>${ticketStatusBadge(item.status)}</td>
            <td>
              <div class="cell-stack">
                <strong>${escapeHtml(item.executor.name)}</strong>
                <small>${escapeHtml(item.executor.role)}</small>
              </div>
            </td>
            <td>
              <div class="table-actions">
                <a class="table-button" href="ticket-detail.html?id=${encodeURIComponent(item.id)}">Просмотр</a>
                ${
                  hasPermission("ticket.edit")
                    ? `<button class="table-button" type="button" data-ticket-edit="${item.id}">Редактировать</button>`
                    : ""
                }
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderTicketDetail() {
    renderPageNotice();
    const ticketId = new URLSearchParams(window.location.search).get("id") || "INC-104";
    const ticket = model.tickets.find((item) => item.id === ticketId) || model.tickets[0];

    if (!ticket) {
      return;
    }

    document.getElementById("detailTicketId").textContent = ticket.id;
    document.getElementById("detailBadges").innerHTML = `
      ${priorityBadge(ticket.priority)}
      ${ticketStatusBadge(ticket.status)}
    `;

    document.getElementById("detailFacts").innerHTML = [
      factCard("Дата регистрации", formatDate(ticket.openedAt, true)),
      factCard("Связанная техника", `${ticket.equipment.inventory} • ${ticket.equipment.name}`),
      factCard("Тип проблемы", ticket.problemType),
      factCard("Исполнитель", `${ticket.executor.name} • ${ticket.executor.role}`),
      factCard("Подразделение", ticket.equipment.department),
      factCard("Автоприоритет", ticket.autoRaised ? "да" : "нет"),
    ].join("");

    document.getElementById("detailDescription").textContent = ticket.description;
    document.getElementById("detailResult").textContent = ticket.result;

    const editButton = document.getElementById("editTicketButton");
    const closeButton = document.getElementById("closeTicketButton");
    const aiButton = document.getElementById("analyzeTicketAiButton");

    if (editButton) {
      editButton.dataset.ticketEdit = ticket.id;
      editButton.hidden = !hasPermission("ticket.edit");
    }

    if (closeButton) {
      closeButton.dataset.ticketId = ticket.id;
      closeButton.disabled = ticket.status === "закрыта";
      closeButton.textContent = ticket.status === "закрыта" ? "Заявка закрыта" : "Закрыть заявку";
      closeButton.hidden = !hasPermission("ticket.close");
    }

    if (aiButton) {
      const insight = getAiInsight(ticket.id);
      const isStale = Boolean(insight && insight.signature !== buildAiSignature(ticket));
      aiButton.dataset.ticketId = ticket.id;
      aiButton.disabled = state.aiRequestTicketId === ticket.id || state.aiStatus.state === "checking";
      aiButton.textContent =
        state.aiRequestTicketId === ticket.id
          ? "AI анализирует..."
          : insight
            ? isStale
              ? "Обновить AI-анализ"
              : "Повторить AI-анализ"
            : "AI-анализ";
    }

    const ticketHead = document.querySelector(".ticket-head");
    if (ticketHead) {
      ticketHead.classList.toggle("is-recent-surface", ticket.id === state.recentTicketId);
    }

    document.getElementById("detailTimeline").innerHTML = ticket.history
      .map((entry) => {
        return `
          <div class="timeline-card">
            <div class="timeline-card__top">
              <div class="badge-row">
                ${ticketStatusBadge(entry.status)}
                <strong>${escapeHtml(entry.actor)}</strong>
              </div>
              <time>${formatDate(entry.time, true)}</time>
            </div>
            <p>${escapeHtml(entry.comment)}</p>
          </div>
        `;
      })
      .join("");

    document.getElementById("detailEquipment").innerHTML = `
      <div class="equipment-box">
        <h4>Инвентарная карточка</h4>
        <p><strong>${escapeHtml(ticket.equipment.inventory)} • ${escapeHtml(ticket.equipment.name)}</strong></p>
        <p>${escapeHtml(ticket.equipment.department)} • ${escapeHtml(ticket.equipment.user)}</p>
        <p class="helper-text" style="margin-top: 10px;">состояние</p>
        <div class="badge-row" style="justify-content: flex-start; margin-top: 4px;">
          ${equipmentStatusBadge(ticket.equipment.status)}
        </div>
        <p class="helper-text" style="margin-top: 12px;">аналитика</p>
        <p>
          Инцидентов по технике: <strong>${ticket.equipment.incidentCount}</strong><br />
          Срок эксплуатации: <strong>${ticket.equipment.age} лет</strong><br />
          Рекомендация: <strong>${escapeHtml(ticket.equipment.recommendation.short)}</strong>
        </p>
      </div>
    `;

    document.getElementById("detailLogic").innerHTML = `
      <div class="logic-box">
        <h4>Причины приоритета</h4>
        <ul class="helper-list">
          ${ticket.priorityReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
        </ul>
      </div>
      <div class="logic-box">
        <h4>Комментарий системы</h4>
        <p>${escapeHtml(ticket.equipment.recommendation.text)}</p>
      </div>
      ${renderAiInsightCard(ticket)}
    `;
  }

  function renderAiInsightCard(ticket) {
    const insight = getAiInsight(ticket.id);
    const isStale = Boolean(insight && insight.signature !== buildAiSignature(ticket));
    const metaParts = [];

    if (insight?.provider) {
      metaParts.push(insight.provider);
    }

    if (insight?.model) {
      metaParts.push(insight.model);
    }

    if (insight?.generatedAt) {
      metaParts.push(formatDate(insight.generatedAt, true));
    }

    if (!insight) {
      return `
        <div class="logic-box ai-insight-card ai-insight-card--empty">
          <h4>AI-анализ заявки</h4>
          <p>${escapeHtml(getAiEmptyStateText())}</p>
        </div>
      `;
    }

    return `
      <div class="logic-box ai-insight-card ${isStale ? "ai-insight-card--stale" : ""}">
        <div class="ai-insight-card__top">
          <div>
            <h4>AI-анализ заявки</h4>
            <p class="ai-insight-card__summary">${escapeHtml(insight.summary || "AI-вывод сформирован.")}</p>
          </div>
          <div class="ai-insight-card__meta">
            ${priorityBadge(insight.proposedPriority || ticket.priority)}
            <span class="table-chip">${escapeHtml(`уверенность: ${insight.confidence || "средняя"}`)}</span>
            ${isStale ? '<span class="status-chip status-chip--watch">требует обновления</span>' : ""}
          </div>
        </div>
        <div class="ai-insight-card__footnote">${escapeHtml(metaParts.join(" • "))}</div>
        <div class="ai-insight-card__grid">
          <div class="ai-insight-block">
            <span class="ai-insight-block__label">Категория</span>
            <strong>${escapeHtml(insight.category || ticket.category || "Не определена")}</strong>
          </div>
          <div class="ai-insight-block">
            <span class="ai-insight-block__label">Executive Note</span>
            <strong>${escapeHtml(insight.executiveNote || "Ручная проверка не требуется.")}</strong>
          </div>
        </div>
        <div class="ai-insight-list">
          <div class="ai-insight-list__group ai-insight-list__group--wide">
            <span class="ai-insight-block__label">Ключевые факторы</span>
            <ul class="helper-list">
              ${(insight.rationale || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </div>
          <div class="ai-insight-list__group">
            <span class="ai-insight-block__label">Следующие действия</span>
            <ul class="helper-list">
              ${(insight.nextSteps || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </div>
          <div class="ai-insight-list__group">
            <span class="ai-insight-block__label">Риски</span>
            <ul class="helper-list">
              ${(insight.risks || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  function getAiEmptyStateText() {
    if (state.aiStatus.state === "checking") {
      return "Проверяется доступность AI-модуля. Если сервер запущен, карточка обновится автоматически.";
    }

    if (state.aiStatus.state === "ready") {
      return "Локальный AI-модуль активен. Запустите анализ, чтобы получить категорию, рекомендуемый приоритет, риски и следующие шаги.";
    }

    if (state.aiStatus.state === "unconfigured") {
      return "Локальный AI-модуль не инициализирован. Перезапустите server.py и повторите попытку.";
    }

    if (state.aiStatus.state === "error") {
      return state.aiStatus.error || "AI-модуль временно недоступен. Попробуйте обновить страницу или перезапустить локальный сервер.";
    }

    return "AI-модуль доступен только при запуске приложения через server.py. При открытии HTML напрямую локальный endpoint отсутствует.";
  }

  function getAiInsight(ticketId) {
    const insight = state.aiInsights?.[ticketId];
    return insight && typeof insight === "object" ? insight : null;
  }

  function buildAiSignature(ticket) {
    return JSON.stringify({
      id: ticket.id,
      status: ticket.status,
      basePriority: ticket.basePriority,
      finalPriority: ticket.priority,
      category: ticket.category,
      problemType: ticket.problemType,
      description: ticket.description,
      result: ticket.result,
      executorId: ticket.executor?.id || "",
      equipmentId: ticket.equipment?.id || "",
      history: ticket.history.map((item) => ({
        status: item.status,
        actor: item.actor,
        time: item.time,
        comment: item.comment,
      })),
    });
  }

  function renderAnalytics() {
    renderPageNotice();
    const highlightNode = document.getElementById("analyticsHighlights");
    const decisionNode = document.getElementById("analyticsDecisionCards");

    renderSignalRibbon("analyticsMetrics", [
      {
        label: "Всего заявок",
        value: model.tickets.length,
        hint: "журнал обращений и инцидентов",
        tone: "ink",
      },
      {
        label: "Автоповышений",
        value: model.tickets.filter((item) => item.autoRaised).length,
        hint: "приоритет усилен по правилам системы",
        tone: "blue",
      },
      {
        label: "Проблемное оборудование",
        value: model.problemEquipment.length,
        hint: "кандидаты на диагностику или замену",
        tone: "amber",
      },
      {
        label: "Среднее время закрытия",
        value: `${Math.round(model.averageResolutionHours)} ч`,
        hint: "по закрытым инцидентам",
        tone: "green",
      },
    ]);

    if (highlightNode) {
      highlightNode.innerHTML = renderNotifications(getAnalyticsHighlightItems());
    }

    if (decisionNode) {
      decisionNode.innerHTML = renderInsightCards(getAnalyticsDecisionCards());
    }

    document.getElementById("categoryChart").innerHTML = renderHorizontalChart(
      model.categoryBreakdown
    );
    document.getElementById("analyticsEquipmentStatus").innerHTML = renderDonutChart(
      model.equipmentStatusBreakdown,
      "ед. техники"
    );

    document.getElementById("problemEquipmentBody").innerHTML = model.problemEquipment
      .slice(0, 6)
      .map((item) => {
        return `
          <tr>
            <td><strong>${escapeHtml(item.inventory)}</strong></td>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.department)}</td>
            <td>${item.incidentCount}</td>
            <td>${escapeHtml(item.recommendation.short)}</td>
          </tr>
        `;
      })
      .join("") ||
      `
        <tr>
          <td colspan="5">
            ${renderEmptyState({
              kicker: "стабильный парк",
              title: "Проблемные активы не выявлены",
              text: "Система не обнаружила оборудования с повторяющимися инцидентами или критичным износом.",
            })}
          </td>
        </tr>
      `;

    document.getElementById("workloadBody").innerHTML = model.workload
      .map((item) => {
        return `
          <tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.role)}</td>
            <td>${item.active}</td>
            <td>${item.closed}</td>
            <td>${item.overdue}</td>
            <td>
              <div class="load-cell">
                <div class="load-bar"><span style="width:${item.load}%"></span></div>
                <strong>${item.load}%</strong>
              </div>
            </td>
          </tr>
        `;
      })
      .join("") ||
      `
        <tr>
          <td colspan="6">
            ${renderEmptyState({
              kicker: "команда не загружена",
              title: "Нет данных по загрузке исполнителей",
              text: "Добавьте обращения и назначения исполнителей, чтобы увидеть распределение рабочей нагрузки.",
            })}
          </td>
        </tr>
      `;
  }

  function renderSignalCenter() {
    renderPageNotice();
    const items = getSignalCenterItems();
    const criticalCount = items.filter((item) => item.tone === "critical").length;
    const watchCount = items.filter((item) => item.tone === "watch").length;
    const activeSources = uniqueValues(items, "source").length;

    renderSignalRibbon("signalCenterMetrics", [
      {
        label: "Всего сигналов",
        value: items.length,
        hint: "объединенная очередь операционных событий",
        tone: "ink",
      },
      {
        label: "Критические",
        value: criticalCount,
        hint: "требуют немедленной реакции или эскалации",
        tone: "red",
      },
      {
        label: "Под контролем",
        value: watchCount,
        hint: "сигналы наблюдения по рискам и повторяемости",
        tone: "amber",
      },
      {
        label: "Источники",
        value: activeSources,
        hint: "модуля формируют текущий поток событий",
        tone: "green",
      },
    ]);

    const feedNode = document.getElementById("signalCenterFeed");
    const actionsNode = document.getElementById("signalCenterActions");
    const coverageNode = document.getElementById("signalCoverageCards");
    const watchlistNode = document.getElementById("signalWatchlist");
    const journalNode = document.getElementById("signalJournalBody");

    if (feedNode) {
      feedNode.innerHTML = renderSignalCenterFeed(items);
    }

    if (actionsNode) {
      actionsNode.innerHTML = renderQuickActions(getSignalActionItems());
    }

    if (coverageNode) {
      coverageNode.innerHTML = renderInsightCards(getSignalCoverageCards(items));
    }

    if (watchlistNode) {
      watchlistNode.innerHTML =
        renderAssetCards(model.problemEquipment.slice(0, 4)) ||
        renderEmptyState({
          kicker: "watchlist пуста",
          title: "Кандидаты на внеплановое внимание не обнаружены",
          text: "Повторяющиеся инциденты и ремонтные риски по технике сейчас не превышают контролируемый уровень.",
        });
    }

    if (journalNode) {
      journalNode.innerHTML = renderSignalJournalRows(getSignalJournalEntries());
    }
  }

  function renderSettingsPage() {
    renderPageNotice();
    renderSignalRibbon("settingsMetrics", [
      {
        label: "Workspace",
        value: runtimeSettings.workspaceName,
        hint: "активное рабочее пространство платформы",
        tone: "ink",
      },
      {
        label: "Правила автоприоритета",
        value: countEnabledRules(runtimeSettings.autoPriority),
        hint: "условий влияют на усиление приоритета",
        tone: "blue",
      },
      {
        label: "SLA warning",
        value: `${runtimeSettings.sla.warningThreshold}%`,
        hint: "порог раннего предупреждения по заявкам",
        tone: "amber",
      },
      {
        label: "Сигнальные каналы",
        value: countSignalChannels(runtimeSettings.notifications),
        hint: "семейств событий участвуют в сигнал-центре",
        tone: "green",
      },
    ]);

    const workspaceNode = document.getElementById("settingsWorkspacePanel");
    const rulesNode = document.getElementById("settingsRulesPanel");
    const slaNode = document.getElementById("settingsSlaPanel");
    const notificationsNode = document.getElementById("settingsNotificationPanel");
    const impactNode = document.getElementById("settingsImpactGrid");
    const policyNode = document.getElementById("settingsPolicyFeed");

    if (workspaceNode) {
      workspaceNode.innerHTML = renderSettingsWorkspaceForm();
    }

    if (rulesNode) {
      rulesNode.innerHTML = renderSettingsRulesForm();
    }

    if (slaNode) {
      slaNode.innerHTML = renderSettingsSlaForm();
    }

    if (notificationsNode) {
      notificationsNode.innerHTML = renderSettingsNotificationForm();
    }

    if (impactNode) {
      impactNode.innerHTML = renderInsightCards(getSettingsImpactCards());
    }

    if (policyNode) {
      policyNode.innerHTML = renderNotifications(getSettingsPolicyItems());
    }
  }

  function renderPageNotice() {
    const workspace = document.querySelector(".workspace");

    if (!workspace) {
      return;
    }

    let node = document.getElementById("pageNotice");
    const currentPage = document.body.dataset.page;

    if (!state.pageNotice || (state.pageNotice.page && state.pageNotice.page !== currentPage)) {
      if (node) {
        node.remove();
      }
      return;
    }

    if (!node) {
      node = document.createElement("section");
      node.id = "pageNotice";
    }

    node.className = `page-notice page-notice--${state.pageNotice.tone || "info"}`;
    node.innerHTML = `
      <div class="page-notice__body">
        <span>${escapeHtml(state.pageNotice.kicker || "workflow update")}</span>
        <strong>${escapeHtml(state.pageNotice.title || "Изменения применены")}</strong>
        <p>${escapeHtml(state.pageNotice.text || "")}</p>
      </div>
      <button class="button" type="button" data-action="dismiss-page-notice">Скрыть</button>
    `;

    workspace.prepend(node);
  }

  function renderSettingsWorkspaceForm() {
    return `
      <div class="settings-form">
        <div class="settings-grid">
          ${editableField(
            "Название workspace",
            `<input id="settingsWorkspaceName" type="text" value="${escapeAttribute(
              runtimeSettings.workspaceName
            )}" />`
          )}
          ${editableField(
            "Ответственный",
            `<input id="settingsWorkspaceOwner" type="text" value="${escapeAttribute(
              runtimeSettings.workspaceOwner
            )}" />`
          )}
          ${editableField(
            "Окружение",
            `
              <select id="settingsEnvironment">
                ${renderOptions(
                  [
                    { value: "production", label: "Production" },
                    { value: "staging", label: "Staging" },
                    { value: "pilot", label: "Pilot" },
                  ],
                  runtimeSettings.environment
                )}
              </select>
            `
          )}
          ${editableField(
            "Дайджест событий",
            `<input id="settingsDigestHour" type="text" value="${escapeAttribute(
              runtimeSettings.digestHour
            )}" />`
          )}
        </div>
        <div class="settings-note">
          Изменения workspace отражаются в верхней панели, поиске и сигнальном слое. Настройки сохраняются локально и используются при последующих запусках.
        </div>
      </div>
    `;
  }

  function renderSettingsRulesForm() {
    return `
      <div class="settings-form settings-form--stack">
        ${settingsToggle(
          "settingsCriticalityBoost",
          "Критичные активы",
          "Повышать приоритет обращений для техники с высокой критичностью.",
          runtimeSettings.autoPriority.criticalityBoost
        )}
        ${settingsToggle(
          "settingsInfrastructureBoost",
          "Сеть и серверы",
          "Усиливать приоритет инцидентов категории «Сеть» и «Сервер».",
          runtimeSettings.autoPriority.infrastructureBoost
        )}
        ${settingsToggle(
          "settingsProductionBoost",
          "Производственный контур",
          "Добавлять приоритет для техники, которая влияет на критичный рабочий процесс.",
          runtimeSettings.autoPriority.productionBoost
        )}
        ${settingsToggle(
          "settingsRepeatedIncidentsBoost",
          "Повторные инциденты",
          "Использовать историю повторяемости обращений при расчёте приоритета.",
          runtimeSettings.autoPriority.repeatedIncidentsBoost
        )}
        ${settingsToggle(
          "settingsOverdueBoost",
          "Просроченные обращения",
          "Повышать приоритет кейсов, которые уже превысили целевой SLA.",
          runtimeSettings.autoPriority.overdueBoost
        )}
        <div class="settings-grid settings-grid--compact">
          ${editableField(
            "Порог повторяемости",
            `<input id="settingsRepeatedIncidentThreshold" type="number" min="2" max="6" value="${escapeAttribute(
              runtimeSettings.autoPriority.repeatedIncidentThreshold
            )}" />`
          )}
        </div>
      </div>
    `;
  }

  function renderSettingsSlaForm() {
    return `
      <div class="settings-form">
        <div class="settings-grid">
          ${editableField(
            "Стандартный SLA, ч",
            `<input id="settingsSlaStandardHours" type="number" min="4" max="72" value="${escapeAttribute(
              runtimeSettings.sla.standardHours
            )}" />`
          )}
          ${editableField(
            "Высокий SLA, ч",
            `<input id="settingsSlaHighHours" type="number" min="2" max="48" value="${escapeAttribute(
              runtimeSettings.sla.highHours
            )}" />`
          )}
          ${editableField(
            "Критический SLA, ч",
            `<input id="settingsSlaCriticalHours" type="number" min="1" max="24" value="${escapeAttribute(
              runtimeSettings.sla.criticalHours
            )}" />`
          )}
          ${editableField(
            "Порог предупреждения, %",
            `<input id="settingsSlaWarningThreshold" type="number" min="40" max="95" value="${escapeAttribute(
              runtimeSettings.sla.warningThreshold
            )}" />`
          )}
        </div>
        <div class="settings-note">
          Значения SLA используются для оценки близости к порогу и влияют на диспетчерские метрики, signal center и приоритетный контроль очереди.
        </div>
      </div>
    `;
  }

  function renderSettingsNotificationForm() {
    return `
      <div class="settings-form settings-form--stack">
        ${settingsToggle(
          "settingsOverdueSignals",
          "Просроченные обращения",
          "Показывать эскалации и просроченные кейсы в signal center.",
          runtimeSettings.notifications.overdueSignals
        )}
        ${settingsToggle(
          "settingsDispatchSignals",
          "Диспетчерские сигналы",
          "Показывать критичные, ожидающие и близкие к порогу SLA обращения.",
          runtimeSettings.notifications.dispatchSignals
        )}
        ${settingsToggle(
          "settingsAssetSignals",
          "Watchlist активов",
          "Показывать ремонтный контур, повторяемость инцидентов и сервисные циклы техники.",
          runtimeSettings.notifications.assetSignals
        )}
        ${settingsToggle(
          "settingsWorkloadSignals",
          "Нагрузка команды",
          "Включать сигналы по дисбалансу исполнителей и распределению очереди.",
          runtimeSettings.notifications.workloadSignals
        )}
        ${settingsToggle(
          "settingsAnalyticsSignals",
          "Аналитические события",
          "Выводить сигналы по доминирующим категориям и коэффициенту закрытия.",
          runtimeSettings.notifications.analyticsSignals
        )}
        ${settingsToggle(
          "settingsDailyDigest",
          "Ежедневный дайджест",
          "Сохранять сценарий для утреннего обзора рабочей смены.",
          runtimeSettings.notifications.dailyDigest
        )}
      </div>
    `;
  }

  function getSettingsImpactCards() {
    const nearSla = model.tickets.filter((item) => item.isNearSla).length;
    const repeatedThreshold = Number(runtimeSettings.autoPriority.repeatedIncidentThreshold);
    const recurringAssets = model.equipment.filter((item) => item.incidentCount >= repeatedThreshold).length;

    return [
      {
        label: "Автоповышения",
        value: `${model.tickets.filter((item) => item.autoRaised).length}`,
        text: "Заявок уже получили повышенный приоритет с учётом текущих правил эскалации.",
      },
      {
        label: "SLA раннее предупреждение",
        value: `${nearSla}`,
        text: "Активных кейсов находятся рядом с порогом SLA по текущему профилю.",
      },
      {
        label: "Повторяемые активы",
        value: `${recurringAssets}`,
        text: "Единиц техники превышают настроенный порог повторяемости инцидентов.",
      },
      {
        label: "Signal Center",
        value: `${getSignalCenterItems().length}`,
        text: "Событий сейчас отображаются в центре сигналов с учётом выбранных каналов.",
      },
      {
        label: "Порог критического SLA",
        value: `${runtimeSettings.sla.criticalHours} ч`,
        text: "Целевое время для кейсов критического приоритета в текущем workspace.",
      },
      {
        label: "Сценарий дайджеста",
        value: runtimeSettings.notifications.dailyDigest ? runtimeSettings.digestHour : "off",
        text: runtimeSettings.notifications.dailyDigest
          ? "Утренний обзор рабочего контура остаётся включённым."
          : "Ежедневный дайджест отключён и не участвует в рутинном обзоре.",
      },
    ];
  }

  function getSettingsPolicyItems() {
    const enabledRuleCount = countEnabledRules(runtimeSettings.autoPriority);
    const enabledSignalCount = countSignalChannels(runtimeSettings.notifications);
    const topExecutor = [...model.workload].sort((a, b) => b.load - a.load)[0];

    return [
      {
        tone: enabledRuleCount >= 4 ? "ok" : "watch",
        title: `Активно ${enabledRuleCount} правил автоприоритета`,
        text: "Изменение правил сразу влияет на классификацию новых и текущих обращений в сервисной очереди.",
        meta: "rule engine • priority",
      },
      {
        tone: runtimeSettings.notifications.dispatchSignals ? "info" : "watch",
        title: `Signal Center использует ${enabledSignalCount} каналов`,
        text: "Отключённые каналы исчезают из верхнего счётчика сигналов, центра событий и global search.",
        meta: "signal center • routing",
      },
      {
        tone: topExecutor && topExecutor.load >= 80 ? "critical" : "ok",
        title: `Нагрузка лидера: ${topExecutor ? topExecutor.name : "—"}`,
        text: topExecutor
          ? `${topExecutor.role}, расчётная загрузка ${topExecutor.load}%. Настройки SLA напрямую влияют на ранние предупреждения по очереди.`
          : "Данные по загрузке команды пока недоступны.",
        meta: "team • workload",
      },
      {
        tone:
          runtimeSettings.sla.warningThreshold <= 65
            ? "watch"
            : runtimeSettings.sla.warningThreshold >= 85
              ? "info"
              : "ok",
        title: `Порог раннего предупреждения ${runtimeSettings.sla.warningThreshold}%`,
        text:
          runtimeSettings.sla.warningThreshold <= 65
            ? "Сигналы будут появляться раньше и делать диспетчерскую очередь более чувствительной."
            : runtimeSettings.sla.warningThreshold >= 85
              ? "Сигналы будут появляться позднее, оставляя больше времени до эскалации."
              : "Настройка находится в сбалансированной зоне для операционного контроля.",
        meta: "sla • threshold",
      },
    ];
  }

  function renderAppChrome() {
    const notificationCount = getSignalCenterItems().length;
    document.querySelectorAll(".appbar__meta .app-pill:first-child").forEach((node) => {
      node.textContent = runtimeSettings.workspaceName;
    });
    document.querySelectorAll(".app-pill--link").forEach((node) => {
      node.textContent = `${notificationCount} сигнала`;
    });
    document.querySelectorAll("[data-workspace-name]").forEach((node) => {
      node.textContent = runtimeSettings.workspaceName;
    });
    document.querySelectorAll("[data-workspace-owner]").forEach((node) => {
      node.textContent = runtimeSettings.workspaceOwner;
    });
    document.querySelectorAll("[data-workspace-environment]").forEach((node) => {
      node.textContent = formatEnvironmentLabel(runtimeSettings.environment);
    });
    document.querySelectorAll(".app-user__avatar").forEach((node) => {
      node.textContent = currentUser.avatar;
    });
    document.querySelectorAll(".app-user__info strong").forEach((node) => {
      node.textContent = currentUser.name;
    });
    document.querySelectorAll(".app-user__info small").forEach((node) => {
      node.textContent = currentUser.label;
    });
  }

  function bindGlobalSearch() {
    document.querySelectorAll('.appbar__search input[type="search"]').forEach((node) => {
      node.setAttribute("readonly", "readonly");
      node.setAttribute("autocomplete", "off");
      node.setAttribute("placeholder", "Глобальный поиск по платформе • Ctrl/⌘ + K");
      node.setAttribute("aria-label", "Открыть глобальный поиск");

      node.addEventListener("click", (event) => {
        event.preventDefault();
        openGlobalSearch("", node);
      });

      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openGlobalSearch("", node);
          return;
        }

        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          openGlobalSearch(event.key, node);
        }
      });
    });

    document.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") {
        return;
      }

      event.preventDefault();

      const existingInput = document.getElementById("commandSearchInput");

      if (existingInput) {
        existingInput.focus();
        existingInput.select();
        return;
      }

      openGlobalSearch("", document.activeElement instanceof HTMLElement ? document.activeElement : null);
    });
  }

  function openGlobalSearch(initialQuery, returnFocusNode) {
    openModal(renderCommandPalette(initialQuery), {
      returnFocus: returnFocusNode,
      variant: "command",
    });

    const input = document.getElementById("commandSearchInput");
    const resultsNode = document.getElementById("commandSearchResults");
    const countNode = document.getElementById("commandSearchCount");

    if (!input || !resultsNode || !countNode) {
      return;
    }

    const render = () => {
      const query = input.value.trim();
      const items = searchRecords(query);

      countNode.textContent = query
        ? `${items.length} ${pluralize(items.length, ["результат", "результата", "результатов"])}`
        : `${items.length} ${pluralize(items.length, ["предложение", "предложения", "предложений"])}`;

      resultsNode.innerHTML = renderCommandPaletteResults(items, query);
    };

    input.addEventListener("input", render);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      const firstResult = resultsNode.querySelector(".command-item");

      if (!firstResult) {
        return;
      }

      event.preventDefault();
      firstResult.click();
    });

    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      render();
    });
  }

  function renderCommandPalette(query) {
    return `
      <div class="command-palette">
        <div class="command-palette__head">
          <div>
            <span class="eyebrow">Global Search</span>
            <h3>Поиск по активам, заявкам, сигналам и командам</h3>
          </div>
          <div class="command-shortcuts">
            <span class="command-key">Ctrl/⌘</span>
            <span class="command-key">K</span>
            <span class="command-key">Enter</span>
          </div>
        </div>
        <label class="command-input">
          <input
            id="commandSearchInput"
            type="search"
            value="${escapeAttribute(query)}"
            placeholder="Начните вводить инвентарный номер, номер заявки, имя сотрудника или название раздела"
            autocomplete="off"
          />
        </label>
        <div class="command-palette__summary">
          <span id="commandSearchCount">0 результатов</span>
          <small>Поиск выполняется по технике, заявкам, исполнителям, сигналам и разделам платформы</small>
        </div>
        <div id="commandSearchResults" class="command-results"></div>
      </div>
    `;
  }

  function searchRecords(query) {
    const tokens = tokenizeSearch(query);

    if (!tokens.length) {
      return searchIndex
        .filter((item) => item.featured)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 12);
    }

    return searchIndex
      .map((item) => {
        const score = getSearchScore(item, tokens);
        return score ? { ...item, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return a.title.localeCompare(b.title, "ru");
      })
      .slice(0, 14);
  }

  function getSearchScore(item, tokens) {
    let score = item.weight;

    for (const token of tokens) {
      if (!item.searchText.includes(token)) {
        return 0;
      }

      if (item.titleText.startsWith(token)) {
        score += 28;
      } else if (item.titleText.includes(token)) {
        score += 20;
      } else if (item.metaText.includes(token)) {
        score += 11;
      } else {
        score += 6;
      }
    }

    return score;
  }

  function renderCommandPaletteResults(items, query) {
    if (!items.length) {
      return `
        <div class="command-empty">
          <span>по запросу ничего не найдено</span>
          <strong>Уточните формулировку</strong>
          <p>Попробуйте указать номер заявки, инвентарный номер, подразделение, исполнителя или название раздела.</p>
        </div>
      `;
    }

    const groupedItems = [
      "Команды",
      "Разделы",
      "Сигналы",
      "Заявки",
      "Техника",
      "Команда",
    ]
      .map((group) => ({
        group,
        items: items.filter((item) => item.group === group).slice(0, group === "Техника" ? 4 : 3),
      }))
      .filter((entry) => entry.items.length);

    return groupedItems
      .map((entry) => {
        return `
          <section class="command-group">
            <div class="command-group__label">
              <span>${escapeHtml(entry.group)}</span>
              <small>${entry.items.length}</small>
            </div>
            <div class="command-group__items">
              ${entry.items.map((item) => renderCommandResultItem(item, query)).join("")}
            </div>
          </section>
        `;
      })
      .join("");
  }

  function renderCommandResultItem(item) {
    const badgeHtml = item.badge
      ? `<span class="status-chip status-chip--${escapeAttribute(item.tone)}">${escapeHtml(item.badge)}</span>`
      : "";

    const body = `
      <div class="command-item__body">
        <div class="command-item__title">
          <strong>${escapeHtml(item.title)}</strong>
          ${badgeHtml}
        </div>
        <p>${escapeHtml(item.text)}</p>
        <small>${escapeHtml(item.meta)}</small>
      </div>
      <span class="command-item__hint">Enter</span>
    `;

    if (item.kind === "action") {
      return `<button class="command-item" type="button" data-action="${escapeAttribute(item.action)}">${body}</button>`;
    }

    if (item.kind === "equipment") {
      return `<button class="command-item" type="button" data-equipment-view="${escapeAttribute(item.equipmentId)}">${body}</button>`;
    }

    return `<a class="command-item" href="${escapeAttribute(item.href)}">${body}</a>`;
  }

  function renderSignalRibbon(containerId, items) {
    const node = document.getElementById(containerId);

    if (!node) {
      return;
    }

    node.innerHTML = items
      .map((item) => {
        return `
          <div class="signal-card signal-card--${item.tone}">
            <div class="signal-card__label">${escapeHtml(item.label)}</div>
            <div class="signal-card__value">${escapeHtml(String(item.value))}</div>
            <div class="signal-card__hint">${escapeHtml(item.hint)}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderFocusCards(items) {
    return items
      .map((item) => {
        return `
          <div class="focus-card">
            <div class="focus-card__kicker">${escapeHtml(item.kicker)}</div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.text)}</p>
          </div>
        `;
      })
      .join("");
  }

  function getFocusItems() {
    const overdue = model.tickets.find((item) => item.status === "просрочена");
    const topProblem = model.problemEquipment[0];
    const heavyExecutor = [...model.workload].sort((a, b) => b.load - a.load)[0];

    return [
      {
        kicker: "приоритет",
        title: overdue ? overdue.id : "Нет просроченных обращений",
        text: overdue
          ? `Заявка связана с ${overdue.equipment.inventory} и требует ускоренного завершения работ.`
          : "Все обращения находятся в допустимом регламенте обработки.",
      },
      {
        kicker: "оборудование",
        title: topProblem ? topProblem.inventory : "Проблемная техника не выявлена",
        text: topProblem
          ? `${topProblem.incidentCount} инцидента(ов) по одной единице техники. ${topProblem.recommendation.short}.`
          : "Система не выявила техники с повторяющимися инцидентами.",
      },
      {
        kicker: "нагрузка",
        title: heavyExecutor.name,
        text: `Текущая расчётная загрузка исполнителя составляет ${heavyExecutor.load}%.`,
      },
    ];
  }

  function getRecommendationItems() {
    const topProblem = model.problemEquipment[0];
    const serviceItems = model.equipment.filter((item) => item.status === "на обслуживании");
    const criticalTicket = model.tickets.find((item) => item.priority === "критический");
    const archiveCandidate = model.problemEquipment.find((item) => item.status === "в ремонте");

    return [
      {
        tone: "red",
        title: "Критический производственный инцидент",
        text: criticalTicket
          ? `${criticalTicket.id} требует немедленного завершения: неисправность влияет на производственный участок.`
          : "Критические производственные инциденты не обнаружены.",
      },
      {
        tone: "amber",
        title: "Плановое обслуживание",
        text: `На обслуживании находится ${serviceItems.length} единицы техники. Требуется завершить сервис и обновить статусы реестра.`,
      },
      {
        tone: "blue",
        title: "Повторяемость инцидентов",
        text: topProblem
          ? `${topProblem.inventory} уже фигурировала в нескольких обращениях. Рекомендуется внеплановая диагностика.`
          : "Повторяющиеся неисправности по одной единице техники не выявлены.",
      },
      {
        tone: "green",
        title: "Решение по изношенной технике",
        text: archiveCandidate
          ? `${archiveCandidate.inventory} целесообразно оценить на предмет замены вместо продолжения ремонтов.`
          : "Система не выявила техники с выраженным риском списания.",
      },
    ];
  }

  function renderRecommendations(items) {
    return items
      .map((item) => {
        return `
          <div class="note-card note-card--${item.tone}">
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.text)}</p>
          </div>
        `;
      })
      .join("");
  }

  function getQuickActions() {
    const overdueCount = model.tickets.filter((item) => item.status === "просрочена").length;

    return [
      {
        code: "AR",
        title: "Новая единица техники",
        text: "Добавить устройство в рабочий каталог и связать его с пользователем или подразделением.",
        action: `<button class="button button--primary" type="button" data-action="add-equipment">Добавить технику</button>`,
        permission: "equipment.create",
      },
      {
        code: "SD",
        title: "Новое обращение",
        text: "Зарегистрировать инцидент, назначить исполнителя и запустить обработку по SLA.",
        action: `<button class="button" type="button" data-action="create-ticket">Создать заявку</button>`,
        permission: "ticket.create",
      },
      {
        code: "WL",
        title: "Просроченные обращения",
        text: overdueCount
          ? `Сейчас в очереди ${overdueCount} просроченных заявок, требующих ускоренной реакции.`
          : "Сейчас в очереди нет просроченных заявок, очередь находится в контролируемом состоянии.",
        action: `<a class="button" href="tickets.html">Открыть журнал</a>`,
      },
      {
        code: "AN",
        title: "Центр сигналов",
        text: "Перейти к единой очереди событий, watchlist активов и приоритетным действиям по сервисному контуру.",
        action: `<a class="button" href="notifications.html">Открыть сигналы</a>`,
      },
    ].filter((item) => !item.permission || hasPermission(item.permission));
  }

  function renderQuickActions(items) {
    return items
      .map((item) => {
        return `
          <div class="action-card">
            <div class="action-card__top">
              <div class="action-card__icon">${escapeHtml(item.code)}</div>
            </div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.text)}</p>
            <div class="action-card__footer">${item.action}</div>
          </div>
        `;
      })
      .join("");
  }

  function getEquipmentModuleInsights() {
    const liveEquipment = model.equipment.filter((item) => item.status !== "списано");
    const averageAge = liveEquipment.length
      ? Math.round(liveEquipment.reduce((sum, item) => sum + item.age, 0) / liveEquipment.length)
      : 0;
    const departments = uniqueValues(model.equipment, "department").length;
    const repeated = model.problemEquipment.filter((item) => item.incidentCount >= 2).length;
    const oldest = [...liveEquipment].sort((a, b) => b.age - a.age)[0];

    return [
      {
        label: "Активы под контролем",
        value: `${liveEquipment.length}`,
        text: "Устройств участвуют в рабочем каталоге и сервисных сценариях.",
      },
      {
        label: "Средний жизненный цикл",
        value: `${averageAge} лет`,
        text: "Средний возраст активного оборудования в реестре.",
      },
      {
        label: "Охват подразделений",
        value: `${departments}`,
        text: "Подразделений уже используют общий каталог техники.",
      },
      {
        label: "Самый возрастной актив",
        value: oldest ? oldest.inventory : "—",
        text: oldest
          ? `${oldest.age} лет в эксплуатации, ${oldest.department}.`
          : "Возрастных активов в текущей выборке нет.",
      },
      {
        label: "Повторяемость инцидентов",
        value: `${repeated}`,
        text: "Единиц техники имеют повторные сервисные обращения.",
      },
      {
        label: "Ремонтный backlog",
        value: `${model.equipment.filter((item) => item.status === "в ремонте").length}`,
        text: "Активов требуют отдельного контроля и планирования работ.",
      },
    ];
  }

  function getTicketDispatchInsights() {
    const overdue = model.tickets.filter((item) => item.status === "просрочена").length;
    const nearSla = model.tickets.filter((item) => item.isNearSla).length;
    const waiting = model.tickets.filter((item) => item.status === "ожидает").length;
    const critical = model.tickets.filter((item) => item.priority === "критический").length;
    const autoRaised = model.tickets.filter((item) => item.autoRaised).length;
    const heavyExecutor = [...model.workload].sort((a, b) => b.load - a.load)[0];

    return [
      {
        label: "SLA-риск",
        value: `${overdue + nearSla}`,
        text: overdue + nearSla
          ? `${overdue} уже просрочены, ${nearSla} приближаются к порогу SLA.`
          : "Очередь сейчас находится в допустимом SLA-контуре.",
      },
      {
        label: "Ожидают окна работ",
        value: `${waiting}`,
        text: "Заявок зависят от поставки, согласования или сервисного окна.",
      },
      {
        label: "Автоприоритет",
        value: `${autoRaised}`,
        text: "Обращений получили повышение приоритета по правилам маршрутизации.",
      },
      {
        label: "Критический контур",
        value: `${critical}`,
        text: "Заявок требуют реакции с максимальным приоритетом.",
      },
      {
        label: "Пиковая нагрузка",
        value: heavyExecutor ? `${heavyExecutor.load}%` : "—",
        text: heavyExecutor
          ? `${heavyExecutor.name} сейчас имеет максимальную расчетную загрузку.`
          : "Данные по загрузке команды пока недоступны.",
      },
      {
        label: "Активная очередь",
        value: `${model.tickets.filter((item) => item.isActive).length}`,
        text: "Обращений остаются в работе и требуют дальнейшего сопровождения.",
      },
    ];
  }

  function getTicketSignalItems() {
    const severityWeight = {
      критический: 4,
      высокий: 3,
      средний: 2,
      низкий: 1,
    };

    return model.tickets
      .filter((item) => item.isActive)
      .sort((a, b) => {
        const severityDiff =
          (severityWeight[b.priority] || 0) - (severityWeight[a.priority] || 0);

        if (severityDiff !== 0) {
          return severityDiff;
        }

        return new Date(b.openedAt) - new Date(a.openedAt);
      })
      .slice(0, 4)
      .map((item) => {
        return {
          tone:
            item.status === "просрочена"
              ? "critical"
              : item.priority === "критический"
                ? "watch"
                : item.autoRaised
                  ? "info"
                  : "ok",
          title: `${item.id} • ${item.problemType}`,
          text: `${item.equipment.inventory} • ${item.executor.name}. Текущий статус: ${item.status}.`,
          meta: `${item.priority} • ${formatDate(item.openedAt)}`,
        };
      });
  }

  function getAnalyticsHighlightItems() {
    const topCategory = model.categoryBreakdown[0];
    const heavyExecutor = [...model.workload].sort((a, b) => b.load - a.load)[0];
    const topProblem = model.problemEquipment[0];
    const closureRate = Math.round(
      (model.tickets.filter((item) => item.status === "закрыта").length / Math.max(1, model.tickets.length)) *
        100
    );

    return [
      topCategory && {
        tone: "watch",
        title: `Доминирующая категория: ${topCategory.label}`,
        text: `${topCategory.value} обращений формируют основной профиль инцидентов в очереди.`,
        meta: "structure • queue",
      },
      heavyExecutor && {
        tone: heavyExecutor.load >= 80 ? "critical" : "info",
        title: `Нагрузка команды: ${heavyExecutor.name}`,
        text: `${heavyExecutor.role}, расчетная загрузка ${heavyExecutor.load}% по активным обращениям.`,
        meta: "team • workload",
      },
      topProblem && {
        tone: "critical",
        title: `Риск по активу ${topProblem.inventory}`,
        text: `${topProblem.incidentCount} инцидентов и рекомендация: ${topProblem.recommendation.short}.`,
        meta: "asset • watchlist",
      },
      {
        tone: closureRate >= 60 ? "ok" : "watch",
        title: `Текущий коэффициент закрытия ${closureRate}%`,
        text: "Показывает долю закрытых обращений относительно общего журнала инцидентов.",
        meta: "sla • closure",
      },
    ].filter(Boolean);
  }

  function getAnalyticsDecisionCards() {
    const serviceCount = model.equipment.filter((item) => item.status === "на обслуживании").length;
    const repairCount = model.equipment.filter((item) => item.status === "в ремонте").length;
    const topCategory = model.categoryBreakdown[0];
    const recurring = model.problemEquipment.filter((item) => item.incidentCount >= 2).length;
    const departments = uniqueValues(model.equipment, "department").length;

    return [
      {
        label: "Категория-лидер",
        value: topCategory ? topCategory.label : "—",
        text: topCategory
          ? `${topCategory.value} обращений формируют основную аналитическую нагрузку.`
          : "Категории обращений пока не определены.",
      },
      {
        label: "Плановое обслуживание",
        value: `${serviceCount}`,
        text: "Активов находятся в сервисном цикле и ждут обновления статусов.",
      },
      {
        label: "Ремонтный контур",
        value: `${repairCount}`,
        text: "Устройств требуют восстановления, ремонта или решения о замене.",
      },
      {
        label: "Повторные кейсы",
        value: `${recurring}`,
        text: "Активов уже формируют паттерн повторяющихся инцидентов.",
      },
      {
        label: "Охват среды",
        value: `${departments}`,
        text: "Подразделений участвуют в общем контуре обслуживания и аналитики.",
      },
      {
        label: "Среднее закрытие",
        value: `${Math.round(model.averageResolutionHours)} ч`,
        text: "Среднее время восстановления по уже завершенным обращениям.",
      },
    ];
  }

  function renderInsightCards(items) {
    return items
      .map((item) => {
        return `
          <article class="insight-card">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
            <p>${escapeHtml(item.text)}</p>
          </article>
        `;
      })
      .join("");
  }

  function getNotificationItems() {
    return getSignalCenterItems().slice(0, 4);
  }

  function getSignalCenterItems() {
    const severityWeight = {
      критический: 4,
      высокий: 3,
      средний: 2,
      низкий: 1,
    };

    const activeTickets = model.tickets
      .filter((item) => item.isActive)
      .sort((a, b) => {
        const severityDiff =
          (severityWeight[b.priority] || 0) - (severityWeight[a.priority] || 0);

        if (severityDiff !== 0) {
          return severityDiff;
        }

        return new Date(b.openedAt) - new Date(a.openedAt);
      });

    const items = [];
    const heavyExecutor = [...model.workload].sort((a, b) => b.load - a.load)[0];
    const topCategory = model.categoryBreakdown[0];
    const closureRate = Math.round(
      (model.tickets.filter((item) => item.status === "закрыта").length / Math.max(1, model.tickets.length)) *
        100
    );

    if (runtimeSettings.notifications.overdueSignals) {
      activeTickets
        .filter((item) => item.status === "просрочена")
        .slice(0, 2)
        .forEach((item, index) => {
          items.push({
            rank: 500 - index,
            tone: "critical",
            source: "Service Desk",
            title: `Эскалация ${item.id}`,
            text: `${item.equipment.inventory} • ${item.problemType}. Срок обработки превышен, требуется ускорение работ.`,
            meta: `Service Desk • просрочена • ${formatDate(item.openedAt)}`,
            context: `${item.executor.name} • ${item.equipment.department}`,
            actionHref: `ticket-detail.html?id=${encodeURIComponent(item.id)}`,
            actionLabel: "Открыть заявку",
          });
        });
    }

    if (runtimeSettings.notifications.dispatchSignals) {
      activeTickets
        .filter((item) => item.status !== "просрочена" && item.priority === "критический")
        .slice(0, 2)
        .forEach((item, index) => {
          items.push({
            rank: 420 - index,
            tone: "watch",
            source: "Service Desk",
            title: `Критичный кейс ${item.id}`,
            text: `${item.equipment.inventory} • ${item.problemType}. Приоритет усилен системой по бизнес-правилам.`,
            meta: `Service Desk • ${item.priority} • ${formatDate(item.openedAt)}`,
            context: `${item.executor.name} • ${item.equipment.department}`,
            actionHref: `ticket-detail.html?id=${encodeURIComponent(item.id)}`,
            actionLabel: "Открыть заявку",
          });
        });

      activeTickets
        .filter((item) => item.status === "ожидает" || item.isNearSla)
        .slice(0, 2)
        .forEach((item, index) => {
          items.push({
            rank: 320 - index,
            tone: item.isNearSla ? "watch" : "info",
            source: "Service Desk",
            title: item.isNearSla ? `SLA-порог по ${item.id}` : `Ожидание по ${item.id}`,
            text: item.isNearSla
              ? `${item.equipment.inventory} близка к порогу SLA: использовано ${item.slaConsumedPercent}% допустимого времени.`
              : `${item.equipment.inventory} находится в очереди ожидания: требуется окно работ, поставка или согласование.`,
            meta: `Service Desk • ${item.status} • ${formatDate(item.openedAt)}`,
            context: `${item.executor.name} • ${item.problemType}`,
            actionHref: `ticket-detail.html?id=${encodeURIComponent(item.id)}`,
            actionLabel: "Открыть заявку",
          });
        });
    }

    if (runtimeSettings.notifications.assetSignals) {
      model.problemEquipment
        .filter((item) => item.status === "в ремонте")
        .slice(0, 2)
        .forEach((item, index) => {
          items.push({
            rank: 280 - index,
            tone: item.incidentCount >= Number(runtimeSettings.autoPriority.repeatedIncidentThreshold)
              ? "critical"
              : "watch",
            source: "Asset Registry",
            title: `Риск по активу ${item.inventory}`,
            text: `${item.name}. ${item.recommendation.short}.`,
            meta: `Asset Registry • ${item.status} • ${item.department}`,
            context: `${item.incidentCount} инцидента(ов) • ${item.user}`,
            actionHref: "equipment.html",
            actionLabel: "Открыть реестр",
          });
        });

      model.problemEquipment
        .filter(
          (item) =>
            item.status !== "в ремонте" &&
            item.incidentCount >= Number(runtimeSettings.autoPriority.repeatedIncidentThreshold)
        )
        .slice(0, 2)
        .forEach((item, index) => {
          items.push({
            rank: 240 - index,
            tone: "watch",
            source: "Asset Registry",
            title: `Повторяемость по ${item.inventory}`,
            text: `${item.incidentCount} обращения по одной единице техники. ${item.recommendation.short}.`,
            meta: `Asset Registry • watchlist • ${item.department}`,
            context: `${item.name} • ${item.user}`,
            actionHref: "equipment.html",
            actionLabel: "Открыть реестр",
          });
        });

      model.equipment
        .filter((item) => item.status === "на обслуживании")
        .sort((a, b) => b.age - a.age)
        .slice(0, 2)
        .forEach((item, index) => {
          items.push({
            rank: 190 - index,
            tone: "info",
            source: "Asset Registry",
            title: `Сервисный цикл ${item.inventory}`,
            text: `${item.name} находится на обслуживании и требует актуализации статуса после завершения работ.`,
            meta: `Asset Registry • сервис • ${item.department}`,
            context: `${item.age} лет в эксплуатации • ${item.user}`,
            actionHref: "equipment.html",
            actionLabel: "Открыть реестр",
          });
        });
    }

    if (runtimeSettings.notifications.workloadSignals && heavyExecutor) {
      items.push({
        rank: 160,
        tone: heavyExecutor.load >= 80 ? "watch" : "ok",
        source: "Analytics",
        title: `Пиковая нагрузка: ${heavyExecutor.name}`,
        text: `${heavyExecutor.role}. Текущая расчетная загрузка составляет ${heavyExecutor.load}% по активным обращениям.`,
        meta: `Analytics • workload • ${heavyExecutor.load}%`,
        context: `${heavyExecutor.active} активных • ${heavyExecutor.overdue} просроченных`,
        actionHref: "analytics.html",
        actionLabel: "Открыть аналитику",
      });
    }

    if (runtimeSettings.notifications.analyticsSignals && topCategory) {
      items.push({
        rank: 140,
        tone: "info",
        source: "Analytics",
        title: `Доминирующий профиль: ${topCategory.label}`,
        text: `${topCategory.value} обращений формируют основной поток инцидентов в текущем контуре поддержки.`,
        meta: `Analytics • category • ${topCategory.value} кейсов`,
        context: "Используйте разбивку по категориям для приоритизации сервиса",
        actionHref: "analytics.html",
        actionLabel: "Открыть аналитику",
      });
      items.push({
        rank: 120,
        tone: closureRate >= 60 ? "ok" : "watch",
        source: "Analytics",
        title: `Коэффициент закрытия ${closureRate}%`,
        text: "Показывает текущую долю закрытых обращений относительно общего журнала инцидентов.",
        meta: `Analytics • closure • ${closureRate}%`,
        context: `${Math.round(model.averageResolutionHours)} ч среднее время закрытия`,
        actionHref: "analytics.html",
        actionLabel: "Открыть аналитику",
      });
    }

    return items
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 10)
      .map(({ rank, ...item }) => item);
  }

  function getSignalActionItems() {
    const overdueCount = model.tickets.filter((item) => item.status === "просрочена").length;
    const heavyExecutor = [...model.workload].sort((a, b) => b.load - a.load)[0];

    return [
      {
        code: "SLA",
        title: "Разобрать просроченные",
        text: overdueCount
          ? `${overdueCount} обращение(й) вышли за SLA и требуют ускоренного завершения или эскалации.`
          : "Просроченных обращений нет, очередь находится в контролируемом состоянии.",
        action: `<a class="button button--primary" href="tickets.html">Открыть очередь</a>`,
      },
      {
        code: "AST",
        title: "Проверить watchlist активов",
        text: `${model.problemEquipment.length} единиц техники находятся под наблюдением по ремонту, износу или повторным инцидентам.`,
        action: `<a class="button" href="equipment.html">Открыть реестр</a>`,
      },
      {
        code: "LDB",
        title: "Сверить нагрузку команды",
        text: heavyExecutor
          ? `${heavyExecutor.name} сейчас лидирует по загрузке с уровнем ${heavyExecutor.load}%.`
          : "Данные по загрузке команды пока отсутствуют.",
        action: `<a class="button" href="analytics.html">Открыть аналитику</a>`,
      },
      {
        code: "NEW",
        title: "Зарегистрировать инцидент",
        text: "Запустить новый цикл обработки и сразу включить обращение в очередь маршрутизации и SLA-контроль.",
        action: `<button class="button" type="button" data-action="create-ticket">Создать заявку</button>`,
        permission: "ticket.create",
      },
    ].filter((item) => !item.permission || hasPermission(item.permission));
  }

  function getSignalCoverageCards(items) {
    const criticalCount = items.filter((item) => item.tone === "critical").length;
    const watchCount = items.filter((item) => item.tone === "watch").length;
    const serviceDeskCount = items.filter((item) => item.source === "Service Desk").length;
    const registryCount = items.filter((item) => item.source === "Asset Registry").length;
    const analyticsCount = items.filter((item) => item.source === "Analytics").length;

    return [
      {
        label: "Critical layer",
        value: `${criticalCount}`,
        text: "Сигналов требуют немедленного действия, эскалации или ускорения обработки.",
      },
      {
        label: "Watch layer",
        value: `${watchCount}`,
        text: "Событий остаются под усиленным наблюдением по рискам и повторяемости.",
      },
      {
        label: "Service Desk",
        value: `${serviceDeskCount}`,
        text: "Сигналов приходят напрямую из очереди обращений и SLA-контроля.",
      },
      {
        label: "Asset Registry",
        value: `${registryCount}`,
        text: "Событий связаны с проблемными активами, сервисом и состоянием техники.",
      },
      {
        label: "Analytics",
        value: `${analyticsCount}`,
        text: "Сигналов построены на загрузке команды и агрегированной сервисной аналитике.",
      },
      {
        label: "Автоприоритет",
        value: `${model.tickets.filter((item) => item.autoRaised).length}`,
        text: "Обращений получили автоматическое усиление приоритета по правилам платформы.",
      },
    ];
  }

  function renderSignalCenterFeed(items) {
    if (!items.length) {
      return renderEmptyState({
        kicker: "очередь сигналов пуста",
        title: "Критичных событий не обнаружено",
        text: "Платформа не видит инцидентов, ремонтных рисков или аналитических отклонений, требующих реакции.",
      });
    }

    const toneLabelByKey = {
      critical: "срочно",
      watch: "контроль",
      info: "сервис",
      ok: "норма",
    };

    return items
      .map((item) => {
        return `
          <article class="activity-card activity-card--${item.tone}">
            <div class="activity-card__top">
              <span class="status-chip status-chip--${item.tone}">${escapeHtml(
                toneLabelByKey[item.tone] || item.tone
              )}</span>
              <small>${escapeHtml(item.meta)}</small>
            </div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.text)}</p>
            <div class="activity-card__footer">
              <span class="activity-card__context">${escapeHtml(item.context)}</span>
              <a class="button" href="${escapeAttribute(item.actionHref)}">${escapeHtml(item.actionLabel)}</a>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function getSignalJournalEntries() {
    const ticketEntries = model.tickets.flatMap((ticket) =>
      ticket.history.map((entry) => ({
        time: entry.time,
        source: "Service Desk",
        scope: ticket.category,
        object: ticket.id,
        title: `${ticket.equipment.inventory} • ${entry.status}`,
        event: entry.comment,
        owner: entry.actor,
        actionHref: `ticket-detail.html?id=${encodeURIComponent(ticket.id)}`,
        actionLabel: entry.status === "закрыта" ? "Открыть карточку" : "Продолжить разбор",
      }))
    );

    const assetEntries = model.problemEquipment.slice(0, 4).map((item) => ({
      time: data.referenceDate,
      source: "Asset Registry",
      scope: item.status,
      object: item.inventory,
      title: item.name,
      event: item.recommendation.short,
      owner: "AssetOps Rules",
      actionHref: "equipment.html",
      actionLabel: "Открыть реестр",
    }));

    return [...ticketEntries, ...assetEntries]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 10);
  }

  function renderSignalJournalRows(entries) {
    if (!entries.length) {
      return `
        <tr>
          <td colspan="6">
            ${renderEmptyState({
              kicker: "журнал пуст",
              title: "Операционных событий пока нет",
              text: "Добавьте обращения или обновите состояние активов, чтобы увидеть историю сигналов и изменений.",
            })}
          </td>
        </tr>
      `;
    }

    return entries
      .map((entry) => {
        return `
          <tr>
            <td>${formatDate(entry.time, true)}</td>
            <td>
              <div class="cell-stack">
                <strong>${escapeHtml(entry.source)}</strong>
                <small>${escapeHtml(entry.scope)}</small>
              </div>
            </td>
            <td><strong>${escapeHtml(entry.object)}</strong></td>
            <td>
              <div class="cell-stack">
                <strong>${escapeHtml(entry.title)}</strong>
                <small>${escapeHtml(entry.event)}</small>
              </div>
            </td>
            <td>${escapeHtml(entry.owner)}</td>
            <td>
              <div class="table-actions">
                <a class="table-button" href="${escapeAttribute(entry.actionHref)}">${escapeHtml(
                  entry.actionLabel
                )}</a>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderNotifications(items) {
    if (!items.length) {
      return renderEmptyState({
        kicker: "сигналы отсутствуют",
        title: "Критичных уведомлений нет",
        text: "Система не видит просроченных обращений или активов, требующих немедленного внимания.",
      });
    }

    return items
      .map((item) => {
        const toneLabel =
          {
            critical: "срочно",
            watch: "контроль",
            info: "сервис",
            ok: "норма",
          }[item.tone] || item.tone;

        return `
          <article class="activity-card activity-card--${item.tone}">
            <div class="activity-card__top">
              <span class="status-chip status-chip--${item.tone}">${escapeHtml(toneLabel)}</span>
              <small>${escapeHtml(item.meta)}</small>
            </div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.text)}</p>
          </article>
        `;
      })
      .join("");
  }

  function getOnboardingItems() {
    const monitoredAssets = model.equipment.filter((item) => item.status !== "списано").length;
    const automationScore = model.tickets.filter((item) => item.autoRaised).length;

    return [
      {
        title: "Asset Registry",
        text: `${model.equipment.length} активов уже загружены в каталог и доступны для сервисного сопровождения.`,
        progress: 100,
        state: "готово",
      },
      {
        title: "Service Desk",
        text: `${model.tickets.length} заявок участвуют в очереди обработки, маршрутизации и контроле SLA.`,
        progress: 92,
        state: "активно",
      },
      {
        title: "Правила приоритета",
        text: `${automationScore} обращений получили автоматическое усиление приоритета на основе бизнес-правил.`,
        progress: 84,
        state: "настроено",
      },
      {
        title: "Monitoring Layer",
        text: `${monitoredAssets} устройств находятся под наблюдением в рабочем контуре и участвуют в аналитике.`,
        progress: 76,
        state: "включено",
      },
    ];
  }

  function renderOnboarding(items) {
    return items
      .map((item) => {
        return `
          <article class="onboarding-card">
            <div class="onboarding-card__top">
              <strong>${escapeHtml(item.title)}</strong>
              <span class="status-chip status-chip--neutral">${escapeHtml(item.state)}</span>
            </div>
            <p>${escapeHtml(item.text)}</p>
            <div class="progress-line" aria-hidden="true">
              <span style="width:${item.progress}%"></span>
            </div>
            <div class="onboarding-card__meta">${item.progress}% готовности</div>
          </article>
        `;
      })
      .join("");
  }

  function renderEmptyState({ kicker, title, text, actions = "" }) {
    return `
      <div class="empty-state">
        ${kicker ? `<span>${escapeHtml(kicker)}</span>` : ""}
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(text)}</p>
        ${actions ? `<div class="empty-state__actions">${actions}</div>` : ""}
      </div>
    `;
  }

  function renderAssetCards(items) {
    return items
      .map((item) => {
        return `
          <div class="asset-card">
            <div class="asset-card__top">
              <div class="cell-stack">
                <strong>${escapeHtml(item.inventory)} • ${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(item.department)}</small>
              </div>
              ${equipmentStatusBadge(item.status)}
            </div>
            <p>${item.incidentCount} инцидента(ов) • ${escapeHtml(item.recommendation.short)}</p>
            <div class="asset-card__actions">
              <button class="table-button" type="button" data-equipment-view="${escapeAttribute(item.id)}">Карточка</button>
              ${
                hasPermission("ticket.create")
                  ? `
                    <button
                      class="table-button"
                      type="button"
                      data-action="create-ticket"
                      data-prefill-equipment-id="${escapeAttribute(item.id)}"
                      data-prefill-source="watchlist"
                    >
                      Инцидент
                    </button>
                  `
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderEquipmentToolbarSummary(rows) {
    const filters = getCurrentEquipmentFilters();
    const activeFilters = countActiveFilters(filters);
    const draft = getDraftMeta("equipment");

    return `
      <div class="toolbar-summary__meta">
        <span class="status-chip status-chip--neutral">в срезе ${rows.length} из ${model.equipment.length}</span>
        <span class="status-chip status-chip--info">фильтров ${activeFilters}</span>
        ${
          draft.available
            ? `<span class="status-chip status-chip--watch">черновик${draft.updatedShort ? ` • ${escapeHtml(draft.updatedShort)}` : ""}</span>`
            : ""
        }
        ${
          !hasPermission("equipment.create") && !hasPermission("equipment.edit") && !hasPermission("equipment.bulk")
            ? '<span class="status-chip status-chip--neutral">режим просмотра</span>'
            : ""
        }
      </div>
      <div class="toolbar-summary__actions">
        ${
          draft.available
            ? `
              <button class="button" type="button" data-action="resume-equipment-draft">Продолжить черновик</button>
              <button class="button" type="button" data-action="clear-equipment-draft">Очистить черновик</button>
            `
            : ""
        }
      </div>
    `;
  }

  function renderTicketToolbarSummary(rows) {
    const filters = getCurrentTicketFilters();
    const activeFilters = countActiveFilters(filters);
    const critical = rows.filter((item) => item.priority === "критический").length;
    const draft = getDraftMeta("ticket");

    return `
      <div class="toolbar-summary__meta">
        <span class="status-chip status-chip--neutral">в срезе ${rows.length} из ${model.tickets.length}</span>
        <span class="status-chip status-chip--info">фильтров ${activeFilters}</span>
        <span class="status-chip status-chip--critical">критических ${critical}</span>
        ${
          draft.available
            ? `<span class="status-chip status-chip--watch">черновик${draft.updatedShort ? ` • ${escapeHtml(draft.updatedShort)}` : ""}</span>`
            : ""
        }
        ${
          !hasPermission("ticket.create") && !hasPermission("ticket.edit") && !hasPermission("ticket.close") && !hasPermission("ticket.bulk")
            ? '<span class="status-chip status-chip--neutral">режим просмотра</span>'
            : ""
        }
      </div>
      <div class="toolbar-summary__actions">
        ${
          draft.available
            ? `
              <button class="button" type="button" data-action="resume-ticket-draft">Продолжить черновик</button>
              <button class="button" type="button" data-action="clear-ticket-draft">Очистить черновик</button>
            `
            : ""
        }
      </div>
    `;
  }

  function renderSavedViews(kind, currentFilters) {
    const actionApply = kind === "equipment" ? "apply-equipment-view" : "apply-ticket-view";
    const actionDelete = kind === "equipment" ? "delete-equipment-view" : "delete-ticket-view";

    return getSavedViews(kind)
      .map((view) => {
        const isActive = compareViewFilters(view.filters, currentFilters);

        return `
          <div class="saved-view ${isActive ? "is-active" : ""}">
            <button class="saved-view__main" type="button" data-action="${actionApply}" data-view-id="${escapeAttribute(
              view.id
            )}">
              <strong>${escapeHtml(view.name)}</strong>
              <small>${escapeHtml(view.summary)}</small>
            </button>
            ${
              view.readonly
                ? ""
                : `<button class="saved-view__remove" type="button" data-action="${actionDelete}" data-view-id="${escapeAttribute(
                    view.id
                  )}" aria-label="Удалить вид ${escapeAttribute(view.name)}">×</button>`
            }
          </div>
        `;
      })
      .join("");
  }

  function getSavedViews(kind) {
    return [...getDefaultViews(kind), ...(state.savedViews[kind] || [])];
  }

  function getDefaultViews(kind) {
    if (kind === "equipment") {
      return [
        {
          id: "equipment-default-all",
          name: "Все активы",
          summary: "полный реестр техники",
          filters: { type: "", department: "", status: "" },
          readonly: true,
        },
        {
          id: "equipment-default-repair",
          name: "Ремонтный контур",
          summary: "оборудование в ремонте",
          filters: { type: "", department: "", status: "в ремонте" },
          readonly: true,
        },
        {
          id: "equipment-default-infra",
          name: "Инфраструктура",
          summary: "ядро инфраструктуры и сеть",
          filters: { type: "", department: "Инфраструктура", status: "" },
          readonly: true,
        },
        {
          id: "equipment-default-notebooks",
          name: "Ноутбуки",
          summary: "мобильные рабочие места",
          filters: { type: "Ноутбук", department: "", status: "" },
          readonly: true,
        },
      ];
    }

    return [
      {
        id: "ticket-default-all",
        name: "Вся очередь",
        summary: "все обращения и инциденты",
        filters: { status: "", priority: "", executor: "" },
        readonly: true,
      },
      {
        id: "ticket-default-overdue",
        name: "SLA-риск",
        summary: "просроченные обращения",
        filters: { status: "просрочена", priority: "", executor: "" },
        readonly: true,
      },
      {
        id: "ticket-default-critical",
        name: "Критический контур",
        summary: "высокая важность и эскалации",
        filters: { status: "", priority: "критический", executor: "" },
        readonly: true,
      },
      {
        id: "ticket-default-awaiting",
        name: "Ожидание окна",
        summary: "кейсы на согласовании или поставке",
        filters: { status: "ожидает", priority: "", executor: "" },
        readonly: true,
      },
    ];
  }

  function saveCurrentView(kind, filters) {
    const normalized = normalizeViewFilters(kind, filters);

    if (!hasActiveFilters(normalized)) {
      openModal(
        modalShell(
          "Сохранение вида",
          `
            <div class="modal-note">
              Для сохранения пользовательского вида задайте хотя бы один фильтр. Базовый полный вид уже доступен в панели сохранённых срезов.
            </div>
          `
        )
      );
      return;
    }

    const existing = getSavedViews(kind).find((view) => compareViewFilters(view.filters, normalized));

    if (existing) {
      openModal(
        modalShell(
          "Сохранение вида",
          `
            <div class="modal-note">
              Такой срез уже существует: <strong>${escapeHtml(existing.name)}</strong>. Его можно применить из панели сохранённых видов.
            </div>
          `
        )
      );
      return;
    }

    const nextView = {
      id: `${kind}-${Date.now().toString(36)}`,
      name: createViewName(kind, normalized),
      summary: describeViewSummary(kind, normalized),
      filters: normalized,
      readonly: false,
    };

    state.savedViews[kind] = [nextView, ...(state.savedViews[kind] || [])].slice(0, 6);
    persistSavedViews();
    rerenderCurrentPage();
  }

  function applySavedView(kind, viewId) {
    const view = getSavedViews(kind).find((item) => item.id === viewId);

    if (!view) {
      return;
    }

    if (kind === "equipment") {
      setEquipmentFilters(view.filters);
      state.equipmentSelection.clear();
      renderEquipmentPage();
      return;
    }

    setTicketFilters(view.filters);
    state.ticketSelection.clear();
    renderTicketsPage();
  }

  function deleteSavedView(kind, viewId) {
    state.savedViews[kind] = (state.savedViews[kind] || []).filter((item) => item.id !== viewId);
    persistSavedViews();
    rerenderCurrentPage();
  }

  function createViewName(kind, filters) {
    const values = Object.values(filters).filter(Boolean);
    const prefix = kind === "equipment" ? "Техника" : "Заявки";

    return `${prefix} • ${values.join(" • ")}`;
  }

  function describeViewSummary(kind, filters) {
    const values = Object.values(filters).filter(Boolean);

    if (!values.length) {
      return kind === "equipment" ? "полный реестр техники" : "все обращения и инциденты";
    }

    return values.join(" • ");
  }

  function normalizeViewFilters(kind, filters) {
    if (kind === "equipment") {
      return {
        type: filters.type || "",
        department: filters.department || "",
        status: filters.status || "",
      };
    }

    return {
      status: filters.status || "",
      priority: filters.priority || "",
      executor: filters.executor || "",
    };
  }

  function compareViewFilters(left, right) {
    return JSON.stringify(left || {}) === JSON.stringify(right || {});
  }

  function hasActiveFilters(filters) {
    return Object.values(filters).some(Boolean);
  }

  function countActiveFilters(filters) {
    return Object.values(filters || {}).filter(Boolean).length;
  }

  function setEquipmentFilters(filters) {
    const typeNode = document.getElementById("equipmentTypeFilter");
    const departmentNode = document.getElementById("equipmentDepartmentFilter");
    const statusNode = document.getElementById("equipmentStatusFilter");

    if (typeNode) {
      typeNode.value = filters.type || "";
    }

    if (departmentNode) {
      departmentNode.value = filters.department || "";
    }

    if (statusNode) {
      statusNode.value = filters.status || "";
    }
  }

  function setTicketFilters(filters) {
    const statusNode = document.getElementById("ticketStatusFilter");
    const priorityNode = document.getElementById("ticketPriorityFilter");
    const executorNode = document.getElementById("ticketExecutorFilter");

    if (statusNode) {
      statusNode.value = filters.status || "";
    }

    if (priorityNode) {
      priorityNode.value = filters.priority || "";
    }

    if (executorNode) {
      executorNode.value = filters.executor || "";
    }
  }

  function renderEquipmentBulkBar(rows) {
    const count = state.equipmentSelection.size;

    return `
      <div class="bulk-bar ${count ? "is-active" : ""}">
        <div class="bulk-bar__meta">
          <strong>${count}</strong>
          <span>из ${rows.length} строк выбрано в текущем срезе</span>
        </div>
        <div class="bulk-bar__actions">
          <button class="button" type="button" data-action="equipment-bulk-service" ${count ? "" : "disabled"}>На обслуживание</button>
          <button class="button" type="button" data-action="equipment-bulk-repair" ${count ? "" : "disabled"}>В ремонт</button>
          <button class="button" type="button" data-action="clear-equipment-selection" ${count ? "" : "disabled"}>Сбросить выбор</button>
        </div>
      </div>
    `;
  }

  function renderTicketBulkBar(rows) {
    const count = state.ticketSelection.size;

    return `
      <div class="bulk-bar ${count ? "is-active" : ""}">
        <div class="bulk-bar__meta">
          <strong>${count}</strong>
          <span>из ${rows.length} кейсов выбрано в текущем срезе</span>
        </div>
        <div class="bulk-bar__actions">
          <button class="button" type="button" data-action="ticket-bulk-priority" ${count ? "" : "disabled"}>Поднять приоритет</button>
          <button class="button" type="button" data-action="ticket-bulk-assign" ${count ? "" : "disabled"}>Переназначить</button>
          <button class="button" type="button" data-action="ticket-bulk-close" ${count ? "" : "disabled"}>Закрыть</button>
          <button class="button" type="button" data-action="clear-ticket-selection" ${count ? "" : "disabled"}>Сбросить выбор</button>
        </div>
      </div>
    `;
  }

  function toggleSelection(selection, ids, nextChecked) {
    ids.forEach((id) => {
      if (nextChecked) {
        selection.add(id);
      } else {
        selection.delete(id);
      }
    });
  }

  function trimSelection(selection, ids) {
    const allowed = new Set(ids);

    [...selection].forEach((id) => {
      if (!allowed.has(id)) {
        selection.delete(id);
      }
    });
  }

  function updateEquipmentStatuses(ids, status, summary) {
    if (!ids.length) {
      return;
    }

    const targetIds = new Set(ids);
    let affected = 0;

    data.equipment.forEach((item) => {
      if (targetIds.has(item.id)) {
        item.status = status;
        affected += 1;
      }
    });

    state.equipmentSelection.clear();
    persistDomainData();
    refreshDerivedState();
    openModal(
      modalShell(
        "Массовое обновление техники",
        `
          <div class="modal-note">
            Обновлено <strong>${affected}</strong> ${pluralize(affected, [
              "устройство",
              "устройства",
              "устройств",
            ])}. ${escapeHtml(summary)}
          </div>
        `
      )
    );
  }

  function raiseSelectedTicketsPriority() {
    const targetIds = new Set(state.ticketSelection);

    if (!targetIds.size) {
      return;
    }

    let affected = 0;

    data.tickets.forEach((ticket) => {
      if (!targetIds.has(ticket.id) || ticket.status === "закрыта") {
        return;
      }

      if (ticket.basePriority === "низкий" || ticket.basePriority === "средний") {
        ticket.basePriority = "высокий";
        ticket.history.push({
          time: referenceDate.toISOString(),
          status: ticket.status,
          actor: "AssetOps Workflow",
          comment: "Приоритет обращения повышен массовым действием диспетчера.",
        });
        affected += 1;
      }
    });

    state.ticketSelection.clear();
    persistDomainData();
    refreshDerivedState();
    openModal(
      modalShell(
        "Массовое обновление заявок",
        `
          <div class="modal-note">
            Повышен базовый приоритет у <strong>${affected}</strong> ${pluralize(affected, [
              "заявка",
              "заявки",
              "заявок",
            ])}. Обновлённые кейсы автоматически пересчитаны в очереди и сигнальном центре.
          </div>
        `
      )
    );
  }

  function reassignSelectedTickets() {
    const targetIds = new Set(state.ticketSelection);

    if (!targetIds.size) {
      return;
    }

    const nextExecutor = [...model.workload].sort((a, b) => a.load - b.load)[0];
    const executorRecord = data.executors.find((item) => item.name === nextExecutor?.name);

    if (!executorRecord) {
      return;
    }

    let affected = 0;

    data.tickets.forEach((ticket) => {
      if (!targetIds.has(ticket.id) || ticket.status === "закрыта") {
        return;
      }

      ticket.executorId = executorRecord.id;
      ticket.history.push({
        time: referenceDate.toISOString(),
        status: ticket.status,
        actor: "AssetOps Workflow",
        comment: `Заявка переназначена на ${executorRecord.name} для балансировки нагрузки команды.`,
      });
      affected += 1;
    });

    state.ticketSelection.clear();
    persistDomainData();
    refreshDerivedState();
    openModal(
      modalShell(
        "Переназначение обращений",
        `
          <div class="modal-note">
            Переназначено <strong>${affected}</strong> ${pluralize(affected, [
              "обращение",
              "обращения",
              "обращений",
            ])}. Новый основной исполнитель: <strong>${escapeHtml(executorRecord.name)}</strong>.
          </div>
        `
      )
    );
  }

  function closeSelectedTickets() {
    const targetIds = new Set(state.ticketSelection);

    if (!targetIds.size) {
      return;
    }

    let affected = 0;

    data.tickets.forEach((ticket) => {
      if (!targetIds.has(ticket.id) || ticket.status === "закрыта") {
        return;
      }

      ticket.status = "закрыта";
      ticket.history.push({
        time: referenceDate.toISOString(),
        status: "закрыта",
        actor: "AssetOps Workflow",
        comment: "Обращение закрыто массовым действием после подтверждения результата работ.",
      });
      affected += 1;
    });

    state.ticketSelection.clear();
    persistDomainData();
    refreshDerivedState();
    openModal(
      modalShell(
        "Закрытие обращений",
        `
          <div class="modal-note">
            Закрыто <strong>${affected}</strong> ${pluralize(affected, [
              "обращение",
              "обращения",
              "обращений",
            ])}. Очередь, аналитика и сигнальный слой пересчитаны автоматически.
          </div>
        `
      )
    );
  }

  function refreshDerivedState() {
    state.settings = runtimeSettings;
    state.currentUser = currentUser;
    model = buildModel();
    searchIndex = buildSearchIndex();
    renderAppChrome();
    rerenderCurrentPage();
  }

  function rerenderCurrentPage() {
    const page = document.body.dataset.page;

    if (page === "dashboard") {
      renderDashboard();
      applyRoleAccessToDom();
      return;
    }

    if (page === "equipment") {
      renderEquipmentPage();
      applyRoleAccessToDom();
      return;
    }

    if (page === "tickets") {
      renderTicketsPage();
      applyRoleAccessToDom();
      return;
    }

    if (page === "ticket-detail") {
      renderTicketDetail();
      applyRoleAccessToDom();
      return;
    }

    if (page === "analytics") {
      renderAnalytics();
      applyRoleAccessToDom();
      return;
    }

    if (page === "notifications") {
      renderSignalCenter();
      applyRoleAccessToDom();
      return;
    }

    if (page === "settings") {
      renderSettingsPage();
      applyRoleAccessToDom();
    }
  }

  function hydrateDataStore() {
    const equipment = readStorageValue("assetops-equipment-data");
    const tickets = readStorageValue("assetops-ticket-data");

    data.equipment = Array.isArray(equipment) ? equipment : cloneData(seedData?.equipment) || [];
    data.tickets = Array.isArray(tickets) ? tickets : cloneData(seedData?.tickets) || [];
  }

  function persistDomainData() {
    writeStorageArray("assetops-equipment-data", data.equipment);
    writeStorageArray("assetops-ticket-data", data.tickets);
  }

  function consumeQueuedPageNotice() {
    const currentPage = document.body.dataset.page;
    const notice = readStorageObject("assetops-page-notice");

    if (!notice.page || notice.page !== currentPage) {
      return;
    }

    if (
      notice.page === "ticket-detail" &&
      notice.ticketId &&
      notice.ticketId !== (new URLSearchParams(window.location.search).get("id") || "")
    ) {
      return;
    }

    applyPageNotice(notice);
    writeStorageObject("assetops-page-notice", {});
  }

  function applyPageNotice(notice) {
    state.pageNotice = notice || null;
    state.recentEquipmentId = notice?.highlightKind === "equipment" ? notice.highlightId || "" : "";
    state.recentTicketId = notice?.highlightKind === "ticket" ? notice.highlightId || "" : "";
  }

  function queuePageNotice(notice) {
    writeStorageObject("assetops-page-notice", notice);
  }

  function clearPageNotice() {
    applyPageNotice(null);
    renderPageNotice();
    rerenderCurrentPage();
  }

  function getDraftStorageKey(kind) {
    return kind === "equipment" ? "assetops-equipment-draft" : "assetops-ticket-draft";
  }

  function loadFormDraft(kind) {
    const draft = readStorageObject(getDraftStorageKey(kind));
    return {
      values: draft.values && typeof draft.values === "object" ? draft.values : {},
      updatedAt: draft.updatedAt || "",
    };
  }

  function getDraftMeta(kind) {
    const draft = loadFormDraft(kind);
    const hasValues = hasAvailableDraft(kind);

    if (!hasValues) {
      return { available: false, updatedAt: "" };
    }

    return {
      available: true,
      updatedAt: draft.updatedAt || "",
      updatedLabel: formatDraftTime(draft.updatedAt),
      updatedShort: formatDraftShortTime(draft.updatedAt),
    };
  }

  function persistEquipmentDraft(values) {
    if (!hasMeaningfulEquipmentDraft(values)) {
      clearFormDraft("equipment");
      return;
    }

    writeStorageObject(getDraftStorageKey("equipment"), {
      values,
      updatedAt: new Date().toISOString(),
    });
    refreshToolbarDraftIndicators();
  }

  function persistTicketDraft(values) {
    if (!hasMeaningfulTicketDraft(values)) {
      clearFormDraft("ticket");
      return;
    }

    writeStorageObject(getDraftStorageKey("ticket"), {
      values,
      updatedAt: new Date().toISOString(),
    });
    refreshToolbarDraftIndicators();
  }

  function clearFormDraft(kind) {
    writeStorageObject(getDraftStorageKey(kind), {});
    refreshToolbarDraftIndicators();
  }

  function hasAvailableDraft(kind) {
    const draft = loadFormDraft(kind);
    return kind === "equipment"
      ? hasMeaningfulEquipmentDraft(draft.values)
      : hasMeaningfulTicketDraft(draft.values);
  }

  function hasMeaningfulEquipmentDraft(values = {}) {
    return Boolean(values.name || values.department || values.user || (values.type && values.type !== "ПК"));
  }

  function hasMeaningfulTicketDraft(values = {}) {
    return Boolean(values.problemType || values.description || values.result);
  }

  function refreshToolbarDraftIndicators() {
    const page = document.body.dataset.page;

    if (page === "equipment") {
      const summaryNode = document.getElementById("equipmentToolbarSummary");
      if (summaryNode) {
        summaryNode.innerHTML = renderEquipmentToolbarSummary(getFilteredEquipmentRows());
      }
    }

    if (page === "tickets") {
      const summaryNode = document.getElementById("ticketToolbarSummary");
      if (summaryNode) {
        summaryNode.innerHTML = renderTicketToolbarSummary(getFilteredTicketRows());
      }
    }
  }

  function loadAiInsights() {
    const raw = readStorageObject("assetops-ai-insights");
    return raw && typeof raw === "object" ? raw : {};
  }

  function persistAiInsights() {
    writeStorageObject("assetops-ai-insights", state.aiInsights || {});
  }

  function saveAiInsight(ticketId, insight) {
    state.aiInsights = {
      ...(state.aiInsights || {}),
      [ticketId]: insight,
    };
    persistAiInsights();
  }

  function refreshAiStatus(force = false) {
    if (document.body.dataset.page === "login") {
      return Promise.resolve(state.aiStatus);
    }

    if (aiStatusRequest && !force) {
      return aiStatusRequest;
    }

    if (!force && ["ready", "unconfigured", "offline", "error"].includes(state.aiStatus.state)) {
      return Promise.resolve(state.aiStatus);
    }

    state.aiStatus = {
      ...state.aiStatus,
      state: "checking",
      error: "",
    };

    aiStatusRequest = fetch("/api/ai/status", {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || "Не удалось получить статус AI-модуля.");
        }

        state.aiStatus = {
          state: payload.configured ? "ready" : "unconfigured",
          configured: Boolean(payload.configured),
          available: Boolean(payload.available),
          provider: payload.provider || "AssetOps Local AI",
          model: payload.model || "",
          error: "",
        };

        if (document.body.dataset.page === "ticket-detail") {
          renderTicketDetail();
          applyRoleAccessToDom();
        }

        return state.aiStatus;
      })
      .catch((error) => {
        state.aiStatus = {
          ...state.aiStatus,
          state: "offline",
          configured: false,
          available: false,
          error: error.message || "AI-модуль недоступен.",
        };

        if (document.body.dataset.page === "ticket-detail") {
          renderTicketDetail();
          applyRoleAccessToDom();
        }

        return state.aiStatus;
      })
      .finally(() => {
        aiStatusRequest = null;
      });

    return aiStatusRequest;
  }

  async function runAiTicketAnalysis(ticketId) {
    if (!ticketId) {
      notify({
        tone: "critical",
        title: "Не выбрана заявка",
        text: "Для AI-анализа нужна конкретная карточка обращения.",
      });
      return;
    }

    await refreshAiStatus(true);

    if (state.aiStatus.state === "unconfigured") {
      notify({
        tone: "critical",
        title: "AI-модуль не инициализирован",
        text: "Перезапустите server.py. Локальный анализатор должен быть доступен вместе с приложением.",
      });
      return;
    }

    if (state.aiStatus.state !== "ready") {
      notify({
        tone: "critical",
        title: "AI-модуль недоступен",
        text: "Запустите приложение через server.py. При открытии HTML напрямую API-эндпоинт отсутствует.",
      });
      return;
    }

    const ticket = model.tickets.find((item) => item.id === ticketId);

    if (!ticket) {
      notify({
        tone: "critical",
        title: "Заявка не найдена",
        text: "Карточка заявки не может быть передана в AI-модуль.",
      });
      return;
    }

    state.aiRequestTicketId = ticketId;
    if (document.body.dataset.page === "ticket-detail") {
      renderTicketDetail();
      applyRoleAccessToDom();
    }

    try {
      const response = await fetch("/api/ai/analyze-ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          workspace: {
            name: state.settings.workspaceName,
            environment: state.settings.environment,
            owner: state.settings.workspaceOwner,
          },
          settings: {
            autoPriority: state.settings.autoPriority,
            sla: state.settings.sla,
          },
          ticket: buildAiTicketPayload(ticket),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "AI-провайдер не вернул корректный ответ.");
      }

      saveAiInsight(ticketId, {
        ...payload,
        signature: buildAiSignature(ticket),
      });

      notify({
        tone: "success",
        title: "AI-анализ обновлён",
        text: `${ticket.id}: получены рекомендации, факторы риска и следующие действия.`,
      });
    } catch (error) {
      notify({
        tone: "critical",
        title: "Не удалось выполнить AI-анализ",
        text: error.message || "Запрос к AI-модулю завершился с ошибкой.",
      });
    } finally {
      state.aiRequestTicketId = "";

      if (document.body.dataset.page === "ticket-detail") {
        renderTicketDetail();
        applyRoleAccessToDom();
      }
    }
  }

  function buildAiTicketPayload(ticket) {
    return {
      id: ticket.id,
      openedAt: ticket.openedAt,
      status: ticket.status,
      category: ticket.category,
      problemType: ticket.problemType,
      basePriority: ticket.basePriority,
      finalPriority: ticket.priority,
      autoRaised: ticket.autoRaised,
      priorityReasons: ticket.priorityReasons,
      description: ticket.description,
      result: ticket.result,
      elapsedHours: ticket.elapsedHours,
      slaTargetHours: ticket.slaTargetHours,
      slaConsumedPercent: ticket.slaConsumedPercent,
      executor: ticket.executor
        ? {
            id: ticket.executor.id,
            name: ticket.executor.name,
            role: ticket.executor.role,
          }
        : null,
      equipment: ticket.equipment
        ? {
            id: ticket.equipment.id,
            inventory: ticket.equipment.inventory,
            name: ticket.equipment.name,
            type: ticket.equipment.type,
            department: ticket.equipment.department,
            user: ticket.equipment.user,
            status: ticket.equipment.status,
            criticality: ticket.equipment.criticality,
            age: ticket.equipment.age,
            incidentCount: ticket.equipment.incidentCount,
            recommendation: ticket.equipment.recommendation,
          }
        : null,
      history: ticket.history.map((item) => ({
        time: item.time,
        status: item.status,
        actor: item.actor,
        comment: item.comment,
      })),
    };
  }

  function loadSavedViews() {
    return {
      equipment: readStorageArray("assetops-equipment-views"),
      tickets: readStorageArray("assetops-ticket-views"),
    };
  }

  function persistSavedViews() {
    writeStorageArray("assetops-equipment-views", state.savedViews.equipment || []);
    writeStorageArray("assetops-ticket-views", state.savedViews.tickets || []);
  }

  function getDefaultAppSettings() {
    return {
      workspaceName: data.enterprise.name || "Primary Workspace",
      workspaceOwner: "Алексей Ковалёв",
      environment: "production",
      digestHour: "09:00",
      autoPriority: {
        criticalityBoost: true,
        infrastructureBoost: true,
        productionBoost: true,
        repeatedIncidentsBoost: true,
        overdueBoost: true,
        repeatedIncidentThreshold: 2,
      },
      sla: {
        standardHours: 24,
        highHours: 12,
        criticalHours: 4,
        warningThreshold: 80,
      },
      notifications: {
        overdueSignals: true,
        dispatchSignals: true,
        assetSignals: true,
        workloadSignals: true,
        analyticsSignals: true,
        dailyDigest: true,
      },
    };
  }

  function loadAppSettings() {
    const defaults = getDefaultAppSettings();
    const raw = readStorageObject("assetops-workspace-settings");

    return normalizeSettings({
      ...defaults,
      ...raw,
      autoPriority: {
        ...defaults.autoPriority,
        ...(raw.autoPriority || {}),
      },
      sla: {
        ...defaults.sla,
        ...(raw.sla || {}),
      },
      notifications: {
        ...defaults.notifications,
        ...(raw.notifications || {}),
      },
    });
  }

  function normalizeSettings(settings) {
    const autoPriority = settings.autoPriority || {};
    const sla = settings.sla || {};
    const notifications = settings.notifications || {};

    return {
      workspaceName: String(settings.workspaceName || data.enterprise.name || "Primary Workspace").trim(),
      workspaceOwner: String(settings.workspaceOwner || "Алексей Ковалёв").trim(),
      environment: ["production", "staging", "pilot"].includes(settings.environment)
        ? settings.environment
        : "production",
      digestHour: String(settings.digestHour || "09:00").trim() || "09:00",
      autoPriority: {
        criticalityBoost: Boolean(autoPriority.criticalityBoost),
        infrastructureBoost: Boolean(autoPriority.infrastructureBoost),
        productionBoost: Boolean(autoPriority.productionBoost),
        repeatedIncidentsBoost: Boolean(autoPriority.repeatedIncidentsBoost),
        overdueBoost: Boolean(autoPriority.overdueBoost),
        repeatedIncidentThreshold: clampNumber(autoPriority.repeatedIncidentThreshold, 2, 6, 2),
      },
      sla: {
        standardHours: clampNumber(sla.standardHours, 4, 72, 24),
        highHours: clampNumber(sla.highHours, 2, 48, 12),
        criticalHours: clampNumber(sla.criticalHours, 1, 24, 4),
        warningThreshold: clampNumber(sla.warningThreshold, 40, 95, 80),
      },
      notifications: {
        overdueSignals: Boolean(notifications.overdueSignals),
        dispatchSignals: Boolean(notifications.dispatchSignals),
        assetSignals: Boolean(notifications.assetSignals),
        workloadSignals: Boolean(notifications.workloadSignals),
        analyticsSignals: Boolean(notifications.analyticsSignals),
        dailyDigest: Boolean(notifications.dailyDigest),
      },
    };
  }

  function collectWorkspaceSettings() {
    return normalizeSettings({
      workspaceName: document.getElementById("settingsWorkspaceName")?.value,
      workspaceOwner: document.getElementById("settingsWorkspaceOwner")?.value,
      environment: document.getElementById("settingsEnvironment")?.value,
      digestHour: document.getElementById("settingsDigestHour")?.value,
      autoPriority: {
        criticalityBoost: document.getElementById("settingsCriticalityBoost")?.checked,
        infrastructureBoost: document.getElementById("settingsInfrastructureBoost")?.checked,
        productionBoost: document.getElementById("settingsProductionBoost")?.checked,
        repeatedIncidentsBoost: document.getElementById("settingsRepeatedIncidentsBoost")?.checked,
        overdueBoost: document.getElementById("settingsOverdueBoost")?.checked,
        repeatedIncidentThreshold: document.getElementById("settingsRepeatedIncidentThreshold")?.value,
      },
      sla: {
        standardHours: document.getElementById("settingsSlaStandardHours")?.value,
        highHours: document.getElementById("settingsSlaHighHours")?.value,
        criticalHours: document.getElementById("settingsSlaCriticalHours")?.value,
        warningThreshold: document.getElementById("settingsSlaWarningThreshold")?.value,
      },
      notifications: {
        overdueSignals: document.getElementById("settingsOverdueSignals")?.checked,
        dispatchSignals: document.getElementById("settingsDispatchSignals")?.checked,
        assetSignals: document.getElementById("settingsAssetSignals")?.checked,
        workloadSignals: document.getElementById("settingsWorkloadSignals")?.checked,
        analyticsSignals: document.getElementById("settingsAnalyticsSignals")?.checked,
        dailyDigest: document.getElementById("settingsDailyDigest")?.checked,
      },
    });
  }

  function saveWorkspaceSettings() {
    runtimeSettings = collectWorkspaceSettings();
    state.settings = runtimeSettings;
    writeStorageObject("assetops-workspace-settings", runtimeSettings);
    refreshDerivedState();
    openModal(
      modalShell(
        "Настройки применены",
        `
          <div class="modal-note">
            Workspace <strong>${escapeHtml(runtimeSettings.workspaceName)}</strong> обновлён. Пересчитаны правила приоритета, SLA-сигналы, global search и signal center.
          </div>
        `
      )
    );
  }

  function resetWorkspaceSettings() {
    runtimeSettings = getDefaultAppSettings();
    state.settings = runtimeSettings;
    writeStorageObject("assetops-workspace-settings", runtimeSettings);
    refreshDerivedState();
    openModal(
      modalShell(
        "Настройки сброшены",
        `
          <div class="modal-note">
            Workspace возвращён к базовому профилю. Восстановлены стандартные правила автоприоритета, SLA и сигнальные каналы.
          </div>
        `
      )
    );
  }

  function readStorageArray(key) {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeStorageArray(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      return;
    }
  }

  function readStorageObject(key) {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeStorageObject(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      return;
    }
  }

  function readStorageValue(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch (error) {
      return undefined;
    }
  }

  function cloneData(value) {
    if (value == null) {
      return value;
    }

    if (typeof window.structuredClone === "function") {
      return window.structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  }

  function ensureToastLayer() {
    if (document.getElementById("toastStack")) {
      return;
    }

    const node = document.createElement("div");
    node.id = "toastStack";
    node.className = "toast-stack";
    document.body.appendChild(node);
  }

  function notify(options) {
    ensureToastLayer();
    const stack = document.getElementById("toastStack");

    if (!stack) {
      return;
    }

    const tone = options?.tone || "info";
    const toast = document.createElement("div");
    toast.className = `toast toast--${tone}`;
    toast.innerHTML = `
      <strong>${escapeHtml(options?.title || "Событие обновлено")}</strong>
      <p>${escapeHtml(options?.text || "")}</p>
    `;

    stack.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add("is-leaving");
      window.setTimeout(() => toast.remove(), 220);
    }, 3600);
  }

  function renderTrendChart(items) {
    const maxValue = Math.max(1, ...items.flatMap((item) => [item.opened, item.closed]));

    return `
      <div class="chart-legend">
        <span><i class="legend-dot legend-dot--primary"></i>зарегистрировано</span>
        <span><i class="legend-dot legend-dot--secondary"></i>закрыто</span>
      </div>
      <div class="bars-chart">
        ${items
          .map((item) => {
            return `
              <div class="bars-chart__group">
                <div class="bars-chart__pair">
                  <div class="bars-chart__bar">
                    <span>${item.opened}</span>
                    <div class="bars-chart__fill bars-chart__fill--primary" style="height:${Math.max(18, (item.opened / maxValue) * 170)}px"></div>
                  </div>
                  <div class="bars-chart__bar">
                    <span>${item.closed}</span>
                    <div class="bars-chart__fill bars-chart__fill--secondary" style="height:${Math.max(18, (item.closed / maxValue) * 170)}px"></div>
                  </div>
                </div>
                <strong>${escapeHtml(item.label)}</strong>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderDonutChart(items, label) {
    const colors = [
      getCss("--chart-1"),
      getCss("--chart-2"),
      getCss("--chart-3"),
      getCss("--chart-4"),
      getCss("--chart-5"),
    ];
    const total = items.reduce((sum, item) => sum + item.value, 0);
    let passed = 0;

    const gradient = items
      .map((item, index) => {
        const start = (passed / total) * 360;
        passed += item.value;
        const end = (passed / total) * 360;
        return `${colors[index % colors.length]} ${start}deg ${end}deg`;
      })
      .join(", ");

    return `
      <div class="donut-layout">
        <div class="donut" style="background: conic-gradient(${gradient})">
          <div class="donut__center">
            <div>
              <strong>${total}</strong>
              <span>${escapeHtml(label)}</span>
            </div>
          </div>
        </div>
        <div class="donut-legend">
          ${items
            .map((item, index) => {
              return `
                <div class="donut-legend__item">
                  <i style="background:${colors[index % colors.length]}"></i>
                  <span>${escapeHtml(item.label)}</span>
                  <strong>${item.value}</strong>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  function renderHorizontalChart(items) {
    const colors = [
      getCss("--chart-1"),
      getCss("--chart-2"),
      getCss("--chart-3"),
      getCss("--chart-4"),
      getCss("--chart-5"),
    ];
    const maxValue = Math.max(1, ...items.map((item) => item.value));

    return `
      <div class="horizontal-chart">
        ${items
          .map((item, index) => {
            return `
              <div class="horizontal-chart__row">
                <div class="horizontal-chart__meta">
                  <strong>${escapeHtml(item.label)}</strong>
                  <span>${item.value}</span>
                </div>
                <div class="horizontal-chart__track">
                  <div class="horizontal-chart__fill" style="width:${(item.value / maxValue) * 100}%; background:${colors[index % colors.length]}"></div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function factCard(label, value) {
    return `
      <div class="fact-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
  }

  function bindModal() {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal();
      }
    });
  }

  function bindActions() {
    document.addEventListener("click", (event) => {
      const closeNode = event.target.closest("[data-close-modal]");
      if (closeNode) {
        closeModal();
        return;
      }

      const actionNode = event.target.closest(
        "[data-action], [data-equipment-view], [data-equipment-edit], [data-ticket-edit]"
      );
      if (!actionNode) {
        return;
      }

      if (actionNode.dataset.equipmentView) {
        openEquipmentViewModal(actionNode.dataset.equipmentView);
        return;
      }

      if (actionNode.dataset.equipmentEdit) {
        if (!guardPermission("equipment.edit", "Редактирование техники недоступно", "Текущая роль может просматривать реестр, но не изменять карточки оборудования.")) {
          return;
        }
        openEquipmentEditModal(actionNode.dataset.equipmentEdit);
        return;
      }

      if (actionNode.dataset.ticketEdit) {
        if (!guardPermission("ticket.edit", "Редактирование заявки недоступно", "Текущая роль не может изменять параметры обращения.")) {
          return;
        }
        openTicketEditModal(actionNode.dataset.ticketEdit);
        return;
      }

      const action = actionNode.dataset.action;

      if (action === "save-equipment-view") {
        saveCurrentView("equipment", getCurrentEquipmentFilters());
        return;
      }

      if (action === "save-settings") {
        if (!guardPermission("settings.manage", "Настройки workspace недоступны", "Изменение политик workspace доступно только администратору.")) {
          return;
        }
        saveWorkspaceSettings();
        return;
      }

      if (action === "reset-settings") {
        if (!guardPermission("settings.manage", "Сброс настроек недоступен", "Текущая роль не может менять глобальные параметры workspace.")) {
          return;
        }
        openConfirmationModal({
          title: "Сбросить настройки workspace?",
          text: "Будут восстановлены стандартные правила автоприоритета, SLA и сигнального слоя.",
          confirmLabel: "Сбросить настройки",
          tone: "critical",
          onConfirm: resetWorkspaceSettings,
        });
        return;
      }

      if (action === "dismiss-page-notice") {
        clearPageNotice();
        return;
      }

      if (action === "confirm-modal-primary") {
        const confirmAction = pendingConfirmAction;
        closeModal();
        if (typeof confirmAction === "function") {
          confirmAction();
        }
        return;
      }

      if (action === "save-ticket-view") {
        saveCurrentView("tickets", getCurrentTicketFilters());
        return;
      }

      if (action === "apply-equipment-view") {
        applySavedView("equipment", actionNode.dataset.viewId);
        return;
      }

      if (action === "apply-ticket-view") {
        applySavedView("tickets", actionNode.dataset.viewId);
        return;
      }

      if (action === "delete-equipment-view") {
        deleteSavedView("equipment", actionNode.dataset.viewId);
        return;
      }

      if (action === "delete-ticket-view") {
        deleteSavedView("tickets", actionNode.dataset.viewId);
        return;
      }

      if (action === "resume-equipment-draft") {
        openEquipmentCreateModal(actionNode);
        return;
      }

      if (action === "resume-ticket-draft") {
        openTicketCreateModal(actionNode);
        return;
      }

      if (action === "clear-equipment-draft") {
        clearFormDraft("equipment");
        if (document.querySelector('form[data-form="equipment-create"]')) {
          openEquipmentCreateModal(actionNode);
          return;
        }
        rerenderCurrentPage();
        notify({
          tone: "info",
          title: "Черновик техники очищен",
          text: "Локально сохранённые незавершённые поля удалены.",
        });
        return;
      }

      if (action === "clear-ticket-draft") {
        clearFormDraft("ticket");
        if (document.querySelector('form[data-form="ticket-create"]')) {
          openTicketCreateModal(actionNode);
          return;
        }
        rerenderCurrentPage();
        notify({
          tone: "info",
          title: "Черновик заявки очищен",
          text: "Локально сохранённая незавершённая заявка удалена.",
        });
        return;
      }

      if (action === "clear-equipment-selection") {
        state.equipmentSelection.clear();
        renderEquipmentPage();
        return;
      }

      if (action === "clear-ticket-selection") {
        state.ticketSelection.clear();
        renderTicketsPage();
        return;
      }

      if (action === "equipment-bulk-service") {
        if (!guardPermission("equipment.bulk", "Массовые действия по технике недоступны", "Текущая роль работает с реестром в режиме без массовых изменений.")) {
          return;
        }
        openConfirmationModal({
          title: "Перевести выбранную технику в обслуживание?",
          text: "Состояние устройств обновится в реестре, watchlist и аналитике сервиса.",
          confirmLabel: "Перевести в обслуживание",
          tone: "watch",
          onConfirm: () =>
            updateEquipmentStatuses(
              [...state.equipmentSelection],
              "на обслуживании",
              "Парк переведён в сервисный цикл."
            ),
        });
        return;
      }

      if (action === "equipment-bulk-repair") {
        if (!guardPermission("equipment.bulk", "Массовые действия по технике недоступны", "Текущая роль работает с реестром в режиме без массовых изменений.")) {
          return;
        }
        openConfirmationModal({
          title: "Перевести выбранную технику в ремонт?",
          text: "Устройства сразу попадут в проблемный контур и будут подсвечены в signal center.",
          confirmLabel: "Перевести в ремонт",
          tone: "critical",
          onConfirm: () =>
            updateEquipmentStatuses(
              [...state.equipmentSelection],
              "в ремонте",
              "Парк помечен как требующий ремонтного контура."
            ),
        });
        return;
      }

      if (action === "ticket-bulk-priority") {
        if (!guardPermission("ticket.bulk", "Массовая обработка заявок недоступна", "Текущая роль не может выполнять bulk-операции по очереди.")) {
          return;
        }
        raiseSelectedTicketsPriority();
        return;
      }

      if (action === "ticket-bulk-assign") {
        if (!guardPermission("ticket.bulk", "Массовая обработка заявок недоступна", "Текущая роль не может выполнять bulk-операции по очереди.")) {
          return;
        }
        reassignSelectedTickets();
        return;
      }

      if (action === "ticket-bulk-close") {
        if (!guardPermission("ticket.bulk", "Массовое закрытие недоступно", "Текущая роль не может массово закрывать обращения.")) {
          return;
        }
        openConfirmationModal({
          title: "Закрыть выбранные обращения?",
          text: "Заявки будут исключены из активной очереди и переведены в финальный статус.",
          confirmLabel: "Закрыть обращения",
          tone: "critical",
          onConfirm: closeSelectedTickets,
        });
        return;
      }

      if (action === "add-equipment") {
        if (!guardPermission("equipment.create", "Добавление техники недоступно", "Текущая роль не может регистрировать новые единицы техники.")) {
          return;
        }
        openEquipmentCreateModal(actionNode);
        return;
      }

      if (action === "create-ticket") {
        if (!guardPermission("ticket.create", "Создание заявки недоступно", "Текущая роль работает без регистрации новых обращений.")) {
          return;
        }
        openTicketCreateModal(actionNode);
        return;
      }

      if (action === "analyze-ticket-ai") {
        const ticketId = actionNode.dataset.ticketId || new URLSearchParams(window.location.search).get("id");
        runAiTicketAnalysis(ticketId);
        return;
      }

      if (action === "reset-equipment-empty") {
        const typeNode = document.getElementById("equipmentTypeFilter");
        const departmentNode = document.getElementById("equipmentDepartmentFilter");
        const statusNode = document.getElementById("equipmentStatusFilter");

        if (typeNode && departmentNode && statusNode) {
          typeNode.value = "";
          departmentNode.value = "";
          statusNode.value = "";
          renderEquipmentPage();
        }
      }

      if (action === "reset-ticket-empty") {
        const statusNode = document.getElementById("ticketStatusFilter");
        const priorityNode = document.getElementById("ticketPriorityFilter");
        const executorNode = document.getElementById("ticketExecutorFilter");

        if (statusNode && priorityNode && executorNode) {
          statusNode.value = "";
          priorityNode.value = "";
          executorNode.value = "";
          renderTicketsPage();
        }
      }

      if (action === "close-ticket") {
        if (!guardPermission("ticket.close", "Закрытие заявки недоступно", "Текущая роль не может переводить обращения в финальный статус.")) {
          return;
        }
        const ticketId = actionNode.dataset.ticketId || new URLSearchParams(window.location.search).get("id");
        openTicketCloseModal(ticketId);
      }
    });

    document.addEventListener("change", (event) => {
      const node = event.target;

      if (!(node instanceof HTMLInputElement)) {
        return;
      }

      if (node.dataset.selectEquipment) {
        if (node.checked) {
          state.equipmentSelection.add(node.dataset.selectEquipment);
        } else {
          state.equipmentSelection.delete(node.dataset.selectEquipment);
        }

        renderEquipmentPage();
        return;
      }

      if (node.dataset.selectTicket) {
        if (node.checked) {
          state.ticketSelection.add(node.dataset.selectTicket);
        } else {
          state.ticketSelection.delete(node.dataset.selectTicket);
        }

        renderTicketsPage();
        return;
      }

      if ("selectAllEquipment" in node.dataset) {
        toggleSelection(state.equipmentSelection, getFilteredEquipmentRows().map((item) => item.id), node.checked);
        renderEquipmentPage();
        return;
      }

      if ("selectAllTicket" in node.dataset) {
        toggleSelection(state.ticketSelection, getFilteredTicketRows().map((item) => item.id), node.checked);
        renderTicketsPage();
      }
    });
  }

  function bindFormInteractions() {
    document.addEventListener("submit", (event) => {
      const form = event.target;

      if (!(form instanceof HTMLFormElement) || !form.dataset.form) {
        return;
      }

      event.preventDefault();

      if (form.dataset.form === "equipment-create") {
        submitEquipmentForm(form, "create");
        return;
      }

      if (form.dataset.form === "equipment-edit") {
        submitEquipmentForm(form, "edit");
        return;
      }

      if (form.dataset.form === "ticket-create") {
        submitTicketForm(form, "create");
        return;
      }

      if (form.dataset.form === "ticket-edit") {
        submitTicketForm(form, "edit");
        return;
      }

      if (form.dataset.form === "ticket-close") {
        submitTicketCloseForm(form);
      }
    });

    const syncInteractiveForm = (target) => {
      const form = target.closest("form[data-form]");

      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      if (form.dataset.form === "ticket-create" || form.dataset.form === "ticket-edit") {
        syncTicketFormPreview(form);
      }

      if (form.dataset.form === "equipment-create" || form.dataset.form === "equipment-edit") {
        syncEquipmentFormPreview(form);
      }

      if (form.dataset.form === "equipment-create") {
        persistEquipmentDraft(collectEquipmentFormData(form));
      }

      if (form.dataset.form === "ticket-create") {
        persistTicketDraft(collectTicketFormData(form, "create"));
      }
    };

    document.addEventListener("input", (event) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        syncInteractiveForm(target);
      }
    });

    document.addEventListener("change", (event) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        syncInteractiveForm(target);
      }
    });
  }

  function openEquipmentViewModal(equipmentId) {
    const item = model.equipment.find((entry) => entry.id === equipmentId);

    if (!item) {
      return;
    }

    openModal(
      modalShell(
        `Просмотр ${item.inventory}`,
        `
          <div class="modal-grid">
            ${modalField("Наименование", item.name)}
            ${modalField("Тип", item.type)}
            ${modalField("Подразделение", item.department)}
            ${modalField("Пользователь", item.user)}
            ${modalField("Состояние", item.status)}
            ${modalField("Срок эксплуатации", `${item.age} лет`)}
          </div>
          <div class="modal-note">
            Инцидентов по технике: <strong>${item.incidentCount}</strong>. ${escapeHtml(
              item.recommendation.text
            )}
          </div>
          <div class="form-actions">
            ${
              hasPermission("equipment.edit")
                ? `<button class="button" type="button" data-equipment-edit="${escapeAttribute(item.id)}">Редактировать</button>`
                : ""
            }
            ${
              hasPermission("ticket.create")
                ? `
                  <button
                    class="button button--primary"
                    type="button"
                    data-action="create-ticket"
                    data-prefill-equipment-id="${escapeAttribute(item.id)}"
                    data-prefill-source="asset"
                  >
                    Создать инцидент
                  </button>
                `
                : ""
            }
          </div>
        `
      )
    );
  }

  function openEquipmentCreateModal(triggerNode) {
    const context = getEquipmentCreateContext(triggerNode);
    const storedDraft = loadFormDraft("equipment");
    const draft = {
      inventory: getSuggestedEquipmentInventory(),
      name: "",
      type: "ПК",
      department: "",
      user: "",
      status: "в эксплуатации",
      commissionedAt: referenceDate.toISOString().slice(0, 10),
      criticality: "medium",
      ...context,
      ...(storedDraft.values || {}),
      _draftMeta: getDraftMeta("equipment"),
    };

    openModal(modalShell("Новая единица техники", renderEquipmentForm("create", draft)), {
      returnFocus: triggerNode,
    });
    syncEquipmentFormPreview(document.querySelector('form[data-form="equipment-create"]'));
    focusModalField("#equipmentInventory");
  }

  function openEquipmentEditModal(equipmentId) {
    const item = model.equipment.find((entry) => entry.id === equipmentId);

    if (!item) {
      return;
    }

    openModal(
      modalShell(
        `Редактирование ${item.inventory}`,
        renderEquipmentForm("edit", {
          id: item.id,
          inventory: item.inventory,
          name: item.name,
          type: item.type,
          department: item.department,
          user: item.user,
          status: item.status,
          commissionedAt: item.commissionedAt,
          criticality: item.criticality,
          incidentCount: item.incidentCount,
        })
      )
    );
    syncEquipmentFormPreview(document.querySelector('form[data-form="equipment-edit"]'));
    focusModalField("#equipmentName");
  }

  function openTicketCreateModal(triggerNode) {
    const defaultEquipment = model.problemEquipment[0] || model.equipment[0];
    const defaultExecutor = getSuggestedExecutorId();
    const context = getTicketCreateContext(triggerNode);
    const storedDraft = loadFormDraft("ticket");
    const draft = {
      id: getNextTicketId(),
      equipmentId: defaultEquipment?.id || "",
      problemType: "",
      category: "Оборудование",
      basePriority: "средний",
      status: "новая",
      executorId: defaultExecutor,
      description: "",
      result: "Ожидается первичная диагностика и подтверждение причины инцидента.",
      ...(storedDraft.values || {}),
      ...context,
      _draftMeta: getDraftMeta("ticket"),
    };

    openModal(modalShell("Новая заявка", renderTicketForm("create", draft)), {
      returnFocus: triggerNode,
    });
    syncTicketFormPreview(document.querySelector('form[data-form="ticket-create"]'));
    focusModalField("#ticketProblemType");
  }

  function openTicketEditModal(ticketId) {
    const ticket = model.tickets.find((entry) => entry.id === ticketId);

    if (!ticket) {
      notify({
        tone: "error",
        title: "Заявка не найдена",
        text: "Не удалось открыть форму редактирования для выбранного обращения.",
      });
      return;
    }

    openModal(
      modalShell(
        `Редактирование ${ticket.id}`,
        renderTicketForm("edit", {
          id: ticket.id,
          equipmentId: ticket.equipmentId,
          problemType: ticket.problemType,
          category: ticket.category,
          basePriority: ticket.basePriority,
          status: ticket.status,
          executorId: ticket.executorId,
          description: ticket.description,
          result: ticket.result,
        })
      )
    );
    syncTicketFormPreview(document.querySelector('form[data-form="ticket-edit"]'));
    focusModalField("#ticketProblemType");
  }

  function openTicketCloseModal(ticketId) {
    const ticket = model.tickets.find((entry) => entry.id === ticketId);

    if (!ticket) {
      notify({
        tone: "error",
        title: "Заявка не найдена",
        text: "Не удалось определить карточку обращения для закрытия.",
      });
      return;
    }

    if (ticket.status === "закрыта") {
      notify({
        tone: "info",
        title: "Заявка уже закрыта",
        text: `${ticket.id} уже переведена в финальный статус и не требует повторного закрытия.`,
      });
      return;
    }

    openModal(
      modalShell(
        `Закрытие ${ticket.id}`,
        `
          <form class="entity-form" data-form="ticket-close" data-ticket-id="${escapeAttribute(ticket.id)}" novalidate>
            <div class="form-grid">
              ${renderFormField(
                "Исполнитель",
                renderInputControl("ticketCloseExecutor", `${ticket.executor.name} • ${ticket.executor.role}`, {
                  readonly: true,
                })
              )}
              ${renderFormField(
                "Связанная техника",
                renderInputControl(
                  "ticketCloseEquipment",
                  `${ticket.equipment.inventory} • ${ticket.equipment.name}`,
                  { readonly: true }
                )
              )}
              ${renderFormField(
                "Результат выполнения",
                renderTextareaControl("ticketCloseResult", ticket.result, {
                  rows: 4,
                  required: true,
                  placeholder: "Опишите итог выполненных работ и текущее состояние.",
                }),
                "form-field--span-2"
              )}
              ${renderFormField(
                "Комментарий в историю",
                renderTextareaControl("ticketCloseComment", "", {
                  rows: 3,
                  placeholder: "Например: работоспособность подтверждена пользователем.",
                }),
                "form-field--span-2"
              )}
            </div>
            <div class="form-feedback" data-form-feedback aria-live="polite"></div>
            <div class="form-actions">
              <button class="button" type="button" data-close-modal>Отмена</button>
              <button class="button button--primary" type="submit">Подтвердить закрытие</button>
            </div>
          </form>
        `
      )
    );
    focusModalField("#ticketCloseResult");
  }

  function openConfirmationModal(options) {
    pendingConfirmAction = typeof options?.onConfirm === "function" ? options.onConfirm : null;
    openModal(
      modalShell(
        options?.title || "Подтвердите действие",
        `
          <div class="modal-note modal-note--confirm">
            ${escapeHtml(options?.text || "Изменения будут применены к текущему рабочему срезу.")}
          </div>
          <div class="form-actions">
            <button class="button" type="button" data-close-modal>Отмена</button>
            <button class="button button--primary" type="button" data-action="confirm-modal-primary">${
              escapeHtml(options?.confirmLabel || "Подтвердить")
            }</button>
          </div>
        `
      )
    );
  }

  function getEquipmentCreateContext(triggerNode) {
    const context = {};
    const page = document.body.dataset.page;

    if (page === "equipment") {
      const filters = getCurrentEquipmentFilters();
      context.type = filters.type || context.type;
      context.department = filters.department || context.department;
      context.status = filters.status || context.status;
    }

    if (triggerNode?.dataset.prefillType) {
      context.type = triggerNode.dataset.prefillType;
    }

    if (triggerNode?.dataset.prefillDepartment) {
      context.department = triggerNode.dataset.prefillDepartment;
    }

    if (triggerNode?.dataset.prefillStatus) {
      context.status = triggerNode.dataset.prefillStatus;
    }

    return context;
  }

  function getTicketCreateContext(triggerNode) {
    const equipmentId = triggerNode?.dataset.prefillEquipmentId || "";
    const equipment = model.equipment.find((item) => item.id === equipmentId);

    if (!equipment) {
      return {};
    }

    return {
      equipmentId: equipment.id,
      category: inferTicketCategoryFromEquipment(equipment),
      executorId: getSuggestedExecutorId(equipment.id),
      problemType: getSuggestedProblemType(equipment),
      result: "Ожидается диагностика по оборудованию, отмеченному системой как требующее внимания.",
    };
  }

  function inferTicketCategoryFromEquipment(equipment) {
    if (!equipment) {
      return "Оборудование";
    }

    if (equipment.type === "Сервер") {
      return "Сервер";
    }

    if (equipment.type === "Сетевое оборудование") {
      return "Сеть";
    }

    if (["Периферия", "Монитор"].includes(equipment.type)) {
      return "Периферия";
    }

    return "Оборудование";
  }

  function getSuggestedProblemType(equipment) {
    if (!equipment) {
      return "";
    }

    if (equipment.status === "в ремонте") {
      return "Контроль восстановительных работ по оборудованию";
    }

    if (equipment.status === "на обслуживании") {
      return "Проверка результата планового обслуживания";
    }

    if (equipment.type === "Сервер") {
      return "Диагностика стабильности серверного узла";
    }

    if (equipment.type === "Сетевое оборудование") {
      return "Проверка сетевой связности и журналов оборудования";
    }

    return "Проверка состояния оборудования и пользовательского рабочего места";
  }

  function renderEquipmentForm(mode, values) {
    const title = mode === "create" ? "Добавление в реестр" : "Обновление карточки актива";

    return `
      <form class="entity-form" data-form="equipment-${escapeAttribute(mode)}" ${
        values.id ? `data-equipment-id="${escapeAttribute(values.id)}"` : ""
      } novalidate>
        ${mode === "create" ? renderDraftBanner("equipment", values._draftMeta) : ""}
        <p class="form-lead">${escapeHtml(title)}. Изменения сразу отражаются в watchlist, реестре и аналитических срезах.</p>
        <div class="form-grid">
          ${renderFormField(
            "Инвентарный номер",
            renderInputControl("equipmentInventory", values.inventory || "", {
              required: true,
              placeholder: "Например, PC-017",
              autofocus: true,
            })
          )}
          ${renderFormField(
            "Тип",
            renderInputControl("equipmentType", values.type || "", {
              required: true,
              placeholder: "ПК, Ноутбук, Сервер",
            })
          )}
          ${renderFormField(
            "Наименование",
            renderInputControl("equipmentName", values.name || "", {
              required: true,
              placeholder: "Рабочая станция финансового отдела",
            }),
            "form-field--span-2"
          )}
          ${renderFormField(
            "Подразделение",
            renderInputControl("equipmentDepartment", values.department || "", {
              required: true,
              placeholder: "Финансовый департамент",
            })
          )}
          ${renderFormField(
            "Пользователь",
            renderInputControl("equipmentUser", values.user || "", {
              required: true,
              placeholder: "ФИО ответственного пользователя",
            })
          )}
          ${renderFormField(
            "Состояние",
            renderSelectControl(
              "equipmentStatus",
              [
                { value: "в эксплуатации", label: "В эксплуатации" },
                { value: "на обслуживании", label: "На обслуживании" },
                { value: "в ремонте", label: "В ремонте" },
                { value: "списано", label: "Списано" },
              ],
              values.status || "в эксплуатации"
            )
          )}
          ${renderFormField(
            "Критичность",
            renderSelectControl(
              "equipmentCriticality",
              [
                { value: "low", label: "Низкая" },
                { value: "medium", label: "Средняя" },
                { value: "high", label: "Высокая" },
              ],
              values.criticality || "medium"
            )
          )}
          ${renderFormField(
            "Дата ввода",
            renderInputControl("equipmentCommissionedAt", values.commissionedAt || "", {
              type: "date",
              required: true,
            })
          )}
          <div class="form-preview form-field--span-2" data-equipment-preview data-incident-count="${escapeAttribute(
            String(values.incidentCount || 0)
          )}"></div>
        </div>
        <div class="form-feedback" data-form-feedback aria-live="polite"></div>
        <div class="form-actions">
          <button class="button" type="button" data-close-modal>Отмена</button>
          <button class="button button--primary" type="submit">${
            mode === "create" ? "Добавить технику" : "Сохранить изменения"
          }</button>
        </div>
      </form>
    `;
  }

  function renderTicketForm(mode, values) {
    const isCreate = mode === "create";

    return `
      <form class="entity-form" data-form="ticket-${escapeAttribute(mode)}" ${
        values.id ? `data-ticket-id="${escapeAttribute(values.id)}"` : ""
      } novalidate>
        ${isCreate ? renderDraftBanner("ticket", values._draftMeta) : ""}
        <p class="form-lead">${
          isCreate
            ? "Новая заявка сразу встраивается в очередь обработки, signal center и SLA-контроль."
            : "Изменения в карточке обращения сразу влияют на приоритет, распределение нагрузки и аналитику."
        }</p>
        <div class="form-grid">
          ${renderFormField(
            "Номер заявки",
            renderInputControl("ticketIdPreview", values.id || "", { readonly: true })
          )}
          ${renderFormField(
            "Статус",
            isCreate
              ? renderInputControl("ticketStatusPreview", "новая", { readonly: true })
              : renderSelectControl(
                  "ticketStatus",
                  [
                    { value: "новая", label: "Новая" },
                    { value: "в работе", label: "В работе" },
                    { value: "ожидает", label: "Ожидает" },
                    { value: "просрочена", label: "Просрочена" },
                    { value: "закрыта", label: "Закрыта" },
                  ],
                  values.status || "новая"
                )
          )}
          ${renderFormField(
            "Оборудование",
            renderSelectControl(
              "ticketEquipmentId",
              model.equipment
                .filter((item) => item.status !== "списано")
                .map((item) => ({
                  value: item.id,
                  label: `${item.inventory} • ${item.name}`,
                })),
              values.equipmentId || ""
            )
          )}
          ${renderFormField(
            "Подразделение",
            renderInputControl("ticketDepartmentPreview", "", { readonly: true })
          )}
          ${renderFormField(
            "Тип проблемы",
            renderInputControl("ticketProblemType", values.problemType || "", {
              required: true,
              placeholder: "Например, ошибка запуска клиента 1С",
              autofocus: true,
            }),
            "form-field--span-2"
          )}
          ${renderFormField(
            "Категория",
            renderSelectControl(
              "ticketCategory",
              [
                { value: "Оборудование", label: "Оборудование" },
                { value: "ПО", label: "ПО" },
                { value: "Сеть", label: "Сеть" },
                { value: "Сервер", label: "Сервер" },
                { value: "Периферия", label: "Периферия" },
              ],
              values.category || "Оборудование"
            )
          )}
          ${renderFormField(
            "Базовый приоритет",
            renderSelectControl(
              "ticketBasePriority",
              [
                { value: "низкий", label: "Низкий" },
                { value: "средний", label: "Средний" },
                { value: "высокий", label: "Высокий" },
                { value: "критический", label: "Критический" },
              ],
              values.basePriority || "средний"
            )
          )}
          ${renderFormField(
            "Исполнитель",
            renderSelectControl(
              "ticketExecutorId",
              data.executors.map((item) => ({
                value: item.id,
                label: `${item.name} • ${item.role}`,
              })),
              values.executorId || getSuggestedExecutorId()
            ),
            "form-field--span-2"
          )}
          ${renderFormField(
            "Описание проблемы",
            renderTextareaControl("ticketDescription", values.description || "", {
              rows: 5,
              required: true,
              placeholder: "Опишите влияние инцидента на пользователя или процесс.",
            }),
            "form-field--span-2"
          )}
          ${renderFormField(
            isCreate ? "Ожидаемый результат" : "Результат / комментарий",
            renderTextareaControl("ticketResult", values.result || "", {
              rows: 4,
              placeholder: "Например, требуется диагностика и подтверждение причины инцидента.",
            }),
            "form-field--span-2"
          )}
          <div class="form-preview form-field--span-2" data-ticket-preview></div>
        </div>
        <div class="form-feedback" data-form-feedback aria-live="polite"></div>
        <div class="form-actions">
          <button class="button" type="button" data-close-modal>Отмена</button>
          <button class="button button--primary" type="submit">${
            isCreate ? "Создать заявку" : "Сохранить изменения"
          }</button>
        </div>
      </form>
    `;
  }

  function renderDraftBanner(kind, meta) {
    if (!meta?.available) {
      return "";
    }

    const action = kind === "equipment" ? "clear-equipment-draft" : "clear-ticket-draft";

    return `
      <div class="form-banner">
        <div class="form-banner__body">
          <span>Черновик</span>
          <strong>Восстановлены незавершённые поля</strong>
          <p>Форма продолжена с локально сохранённого состояния${meta.updatedLabel ? ` • ${escapeHtml(meta.updatedLabel)}` : ""}.</p>
        </div>
        <button class="button" type="button" data-action="${action}">Очистить</button>
      </div>
    `;
  }

  function submitEquipmentForm(form, mode) {
    if (!hasPermission(mode === "create" ? "equipment.create" : "equipment.edit")) {
      showFormFeedback(form, "Текущая роль не может изменять каталог техники.", "error");
      return;
    }

    const payload = collectEquipmentFormData(form);
    const validation = validateEquipmentPayload(payload, mode === "edit" ? form.dataset.equipmentId : "");
    const currentPage = document.body.dataset.page;

    if (!validation.valid) {
      showFormFeedback(form, validation.message, "error");
      notify({
        tone: "error",
        title: "Проверьте поля техники",
        text: validation.message,
      });
      if (validation.fieldId) {
        focusModalField(`#${validation.fieldId}`);
      }
      return;
    }

    clearFormFeedback(form);

    if (mode === "create") {
      const equipmentId = buildEquipmentRecordId(payload.inventory);
      data.equipment.unshift({
        id: equipmentId,
        ...payload,
      });

      clearFormDraft("equipment");
      persistDomainData();

      if (currentPage === "equipment") {
        applyPageNotice({
          page: "equipment",
          kicker: "asset registered",
          title: "Техника добавлена в реестр",
          text: `${payload.inventory} поставлена на учёт и включена в эксплуатационный контур.`,
          tone: "success",
          highlightKind: "equipment",
          highlightId: equipmentId,
        });
      }

      refreshDerivedState();
      closeModal();

      if (currentPage !== "equipment") {
        queuePageNotice({
          page: "equipment",
          kicker: "asset registered",
          title: "Техника добавлена в реестр",
          text: `${payload.inventory} поставлена на учёт и готова к дальнейшей работе в каталоге.`,
          tone: "success",
          highlightKind: "equipment",
          highlightId: equipmentId,
        });
        window.location.href = "equipment.html";
        return;
      }

      return;
    }

    const equipment = data.equipment.find((item) => item.id === form.dataset.equipmentId);

    if (!equipment) {
      showFormFeedback(form, "Не удалось найти карточку техники для обновления.", "error");
      return;
    }

    Object.assign(equipment, payload);
    persistDomainData();
    applyPageNotice({
      page: "equipment",
      kicker: "asset updated",
      title: "Карточка техники обновлена",
      text: `${payload.inventory} синхронизирована с реестром, watchlist и сервисными срезами.`,
      tone: "info",
      highlightKind: "equipment",
      highlightId: equipment.id,
    });
    refreshDerivedState();
    closeModal();
  }

  function submitTicketForm(form, mode) {
    if (!hasPermission(mode === "create" ? "ticket.create" : "ticket.edit")) {
      showFormFeedback(form, "Текущая роль не может изменять сервисные обращения.", "error");
      return;
    }

    const payload = collectTicketFormData(form, mode);
    const validation = validateTicketPayload(payload);
    const currentPage = document.body.dataset.page;

    if (!validation.valid) {
      showFormFeedback(form, validation.message, "error");
      notify({
        tone: "error",
        title: "Проверьте поля заявки",
        text: validation.message,
      });
      if (validation.fieldId) {
        focusModalField(`#${validation.fieldId}`);
      }
      return;
    }

    clearFormFeedback(form);
    const timestamp = referenceDate.toISOString();

    if (mode === "create") {
      const nextTicketId = getNextTicketId();

      data.tickets.unshift({
        id: nextTicketId,
        openedAt: timestamp,
        equipmentId: payload.equipmentId,
        problemType: payload.problemType,
        category: payload.category,
        basePriority: payload.basePriority,
        status: "новая",
        executorId: payload.executorId,
        description: payload.description,
        result: payload.result || "Ожидается первичная диагностика и назначение исполнителя.",
        history: [
          {
            time: timestamp,
            status: "новая",
            actor: runtimeSettings.workspaceOwner || "AssetOps Workflow",
            comment: "Заявка зарегистрирована через сервисную форму.",
          },
        ],
      });

      clearFormDraft("ticket");
      persistDomainData();
      queuePageNotice({
        page: "ticket-detail",
        ticketId: nextTicketId,
        kicker: "service case created",
        title: "Новая заявка зарегистрирована",
        text: `${nextTicketId} добавлена в очередь и уже участвует в SLA-контроле.`,
        tone: "success",
        highlightKind: "ticket",
        highlightId: nextTicketId,
      });
      refreshDerivedState();
      closeModal();
      window.location.href = `ticket-detail.html?id=${encodeURIComponent(nextTicketId)}`;
      return;
    }

    const ticket = data.tickets.find((item) => item.id === form.dataset.ticketId);

    if (!ticket) {
      showFormFeedback(form, "Не удалось найти карточку обращения для обновления.", "error");
      return;
    }

    const changes = [];

    if (ticket.equipmentId !== payload.equipmentId) {
      changes.push("обновлена связанная техника");
    }
    if (ticket.executorId !== payload.executorId) {
      changes.push("изменён исполнитель");
    }
    if (ticket.basePriority !== payload.basePriority) {
      changes.push("скорректирован базовый приоритет");
    }
    if (ticket.status !== payload.status) {
      changes.push(`статус переведён в «${payload.status}»`);
    }

    Object.assign(ticket, payload);
    ticket.history.push({
      time: timestamp,
      status: payload.status,
      actor: runtimeSettings.workspaceOwner || "AssetOps Workflow",
      comment: changes.length
        ? `Карточка обновлена: ${changes.join(", ")}.`
        : "Карточка заявки обновлена через форму редактирования.",
    });

    persistDomainData();
    const pageNotice = {
      page: currentPage === "ticket-detail" ? "ticket-detail" : "tickets",
      ticketId: ticket.id,
      kicker: "case updated",
      title: "Заявка обновлена",
      text: `${ticket.id} пересчитана по приоритету, SLA и сигналам обработки.`,
      tone: "info",
      highlightKind: "ticket",
      highlightId: ticket.id,
    };
    applyPageNotice(pageNotice);
    refreshDerivedState();
    closeModal();
  }

  function submitTicketCloseForm(form) {
    if (!hasPermission("ticket.close")) {
      showFormFeedback(form, "Текущая роль не может закрывать обращения.", "error");
      return;
    }

    const ticket = data.tickets.find((item) => item.id === form.dataset.ticketId);

    if (!ticket) {
      showFormFeedback(form, "Не удалось найти обращение для закрытия.", "error");
      return;
    }

    const result = readFormValue(form, "ticketCloseResult");
    const comment =
      readFormValue(form, "ticketCloseComment") ||
      "Работоспособность подтверждена, обращение закрыто по результату выполненных работ.";

    if (!result) {
      showFormFeedback(form, "Укажите итог выполненных работ перед закрытием заявки.", "error");
      notify({
        tone: "error",
        title: "Не заполнен результат",
        text: "Для закрытия заявки нужен финальный комментарий по выполнению.",
      });
      focusModalField("#ticketCloseResult");
      return;
    }

    ticket.status = "закрыта";
    ticket.result = result;
    ticket.history.push({
      time: referenceDate.toISOString(),
      status: "закрыта",
      actor: runtimeSettings.workspaceOwner || "AssetOps Workflow",
      comment,
    });

    persistDomainData();
    applyPageNotice({
      page: "ticket-detail",
      ticketId: ticket.id,
      kicker: "case closed",
      title: "Заявка закрыта",
      text: `${ticket.id} исключена из активной очереди и зафиксирована в метриках выполнения.`,
      tone: "success",
      highlightKind: "ticket",
      highlightId: ticket.id,
    });
    refreshDerivedState();
    closeModal();
  }

  function collectEquipmentFormData(form) {
    return {
      inventory: readFormValue(form, "equipmentInventory").toUpperCase(),
      name: readFormValue(form, "equipmentName"),
      type: readFormValue(form, "equipmentType"),
      department: readFormValue(form, "equipmentDepartment"),
      user: readFormValue(form, "equipmentUser"),
      status: readFormValue(form, "equipmentStatus"),
      commissionedAt: readFormValue(form, "equipmentCommissionedAt"),
      criticality: readFormValue(form, "equipmentCriticality") || "medium",
    };
  }

  function collectTicketFormData(form, mode) {
    return {
      equipmentId: readFormValue(form, "ticketEquipmentId"),
      problemType: readFormValue(form, "ticketProblemType"),
      category: readFormValue(form, "ticketCategory"),
      basePriority: readFormValue(form, "ticketBasePriority"),
      status: mode === "create" ? "новая" : readFormValue(form, "ticketStatus"),
      executorId: readFormValue(form, "ticketExecutorId"),
      description: readFormValue(form, "ticketDescription"),
      result: readFormValue(form, "ticketResult"),
    };
  }

  function validateEquipmentPayload(payload, currentId) {
    if (!payload.inventory) {
      return { valid: false, message: "Укажите инвентарный номер.", fieldId: "equipmentInventory" };
    }

    if (!payload.name) {
      return { valid: false, message: "Укажите наименование техники.", fieldId: "equipmentName" };
    }

    if (!payload.type) {
      return { valid: false, message: "Укажите тип техники.", fieldId: "equipmentType" };
    }

    if (!payload.department) {
      return { valid: false, message: "Укажите подразделение.", fieldId: "equipmentDepartment" };
    }

    if (!payload.user) {
      return { valid: false, message: "Укажите пользователя или ответственного.", fieldId: "equipmentUser" };
    }

    if (!payload.commissionedAt) {
      return { valid: false, message: "Укажите дату ввода в эксплуатацию.", fieldId: "equipmentCommissionedAt" };
    }

    const duplicate = data.equipment.find(
      (item) => item.inventory.toLowerCase() === payload.inventory.toLowerCase() && item.id !== currentId
    );

    if (duplicate) {
      return {
        valid: false,
        message: `Инвентарный номер ${payload.inventory} уже используется в реестре.`,
        fieldId: "equipmentInventory",
      };
    }

    return { valid: true };
  }

  function validateTicketPayload(payload) {
    if (!payload.equipmentId) {
      return { valid: false, message: "Выберите оборудование для заявки.", fieldId: "ticketEquipmentId" };
    }

    if (!payload.problemType) {
      return { valid: false, message: "Укажите тип проблемы.", fieldId: "ticketProblemType" };
    }

    if (!payload.category) {
      return { valid: false, message: "Выберите категорию обращения.", fieldId: "ticketCategory" };
    }

    if (!payload.basePriority) {
      return { valid: false, message: "Укажите базовый приоритет.", fieldId: "ticketBasePriority" };
    }

    if (!payload.executorId) {
      return { valid: false, message: "Назначьте исполнителя.", fieldId: "ticketExecutorId" };
    }

    if (!payload.description) {
      return { valid: false, message: "Добавьте описание проблемы.", fieldId: "ticketDescription" };
    }

    if (payload.status === "закрыта" && !payload.result) {
      return { valid: false, message: "Для закрытой заявки укажите результат выполнения.", fieldId: "ticketResult" };
    }

    return { valid: true };
  }

  function syncEquipmentFormPreview(form) {
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const previewNode = form.querySelector("[data-equipment-preview]");

    if (!previewNode) {
      return;
    }

    const incidentCount = Number(previewNode.dataset.incidentCount || 0);
    const commissionedAt = readFormValue(form, "equipmentCommissionedAt") || referenceDate.toISOString().slice(0, 10);
    const draft = {
      status: readFormValue(form, "equipmentStatus") || "в эксплуатации",
      criticality: readFormValue(form, "equipmentCriticality") || "medium",
    };
    const age = yearsInService(commissionedAt);
    const recommendation = getEquipmentRecommendation(draft, incidentCount, age);

    previewNode.innerHTML = `
      <div class="form-preview__head">
        <span>Сервисная оценка</span>
        ${equipmentStatusBadge(draft.status)}
      </div>
      <strong>${escapeHtml(recommendation.short)}</strong>
      <p>${escapeHtml(recommendation.text)}</p>
      <div class="form-preview__meta">
        <span>срок службы: ${age} ${pluralize(age, ["год", "года", "лет"])}</span>
        <span>инцидентов: ${incidentCount}</span>
      </div>
    `;
  }

  function syncTicketFormPreview(form) {
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const equipmentId = readFormValue(form, "ticketEquipmentId");
    const departmentNode = form.querySelector("#ticketDepartmentPreview");
    const previewNode = form.querySelector("[data-ticket-preview]");
    const equipment = model.equipment.find((item) => item.id === equipmentId);

    if (departmentNode instanceof HTMLInputElement) {
      departmentNode.value = equipment ? equipment.department : "";
    }

    if (!previewNode) {
      return;
    }

    if (!equipment) {
      previewNode.innerHTML = `
        <div class="form-preview__head">
          <span>Автоприоритет</span>
          <strong>Ожидает выбора техники</strong>
        </div>
        <p>Выберите оборудование, чтобы система рассчитала фактический приоритет и факторы риска.</p>
      `;
      return;
    }

    const preview = buildTicketPreview({
      formMode: form.dataset.form === "ticket-create" ? "create" : "edit",
      ticketId: form.dataset.ticketId,
      equipmentId,
      problemType: readFormValue(form, "ticketProblemType"),
      category: readFormValue(form, "ticketCategory") || "Оборудование",
      basePriority: readFormValue(form, "ticketBasePriority") || "средний",
      status:
        form.dataset.form === "ticket-create"
          ? "новая"
          : readFormValue(form, "ticketStatus") || "новая",
      executorId: readFormValue(form, "ticketExecutorId") || getSuggestedExecutorId(),
    });

    previewNode.innerHTML = `
      <div class="form-preview__head">
        <span>Автоприоритет</span>
        <div class="badge-row">
          ${priorityBadge(preview.priority)}
          ${ticketStatusBadge(preview.status)}
        </div>
      </div>
      <strong>${preview.autoRaised ? "Приоритет усилен правилами системы" : "Стандартная классификация обращения"}</strong>
      <p>${escapeHtml(preview.equipment.recommendation.text)}</p>
      <ul class="helper-list">
        ${preview.priorityReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
      </ul>
    `;
  }

  function buildTicketPreview(values) {
    const equipment = model.equipment.find((item) => item.id === values.equipmentId) || model.equipment[0];
    const executor =
      data.executors.find((item) => item.id === values.executorId) ||
      data.executors.find((item) => item.id === getSuggestedExecutorId()) ||
      data.executors[0];
    const existingCount = data.tickets.filter((item) => item.equipmentId === values.equipmentId).length;
    const incidentCount = values.formMode === "create" ? existingCount + 1 : Math.max(1, existingCount);

    return enrichTicket(
      {
        id: values.ticketId || "PREVIEW",
        openedAt: referenceDate.toISOString(),
        equipmentId: values.equipmentId,
        problemType: values.problemType || "Не указано",
        category: values.category || "Оборудование",
        basePriority: values.basePriority || "средний",
        status: values.status || "новая",
        executorId: executor.id,
        description: "",
        result: "",
        history: [],
      },
      equipment,
      executor,
      incidentCount
    );
  }

  function readFormValue(form, name) {
    const control = form.elements.namedItem(name);

    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    ) {
      return control.value.trim();
    }

    return "";
  }

  function showFormFeedback(form, message, tone) {
    const node = form.querySelector("[data-form-feedback]");

    if (!node) {
      return;
    }

    node.textContent = message;
    node.dataset.tone = tone || "error";
  }

  function clearFormFeedback(form) {
    const node = form.querySelector("[data-form-feedback]");

    if (!node) {
      return;
    }

    node.textContent = "";
    delete node.dataset.tone;
  }

  function renderFormField(label, controlMarkup, className = "") {
    return `
      <div class="form-field ${className}">
        <label>${escapeHtml(label)}</label>
        ${controlMarkup}
      </div>
    `;
  }

  function renderInputControl(id, value, options = {}) {
    return `
      <input
        id="${escapeAttribute(id)}"
        name="${escapeAttribute(id)}"
        type="${escapeAttribute(options.type || "text")}"
        value="${escapeAttribute(value || "")}"
        ${options.placeholder ? `placeholder="${escapeAttribute(options.placeholder)}"` : ""}
        ${options.readonly ? "readonly" : ""}
        ${options.required ? "required" : ""}
        ${options.autofocus ? "data-autofocus" : ""}
      />
    `;
  }

  function renderTextareaControl(id, value, options = {}) {
    return `
      <textarea
        id="${escapeAttribute(id)}"
        name="${escapeAttribute(id)}"
        rows="${escapeAttribute(String(options.rows || 4))}"
        ${options.placeholder ? `placeholder="${escapeAttribute(options.placeholder)}"` : ""}
        ${options.required ? "required" : ""}
      >${escapeHtml(value || "")}</textarea>
    `;
  }

  function renderSelectControl(id, options, currentValue) {
    return `
      <select id="${escapeAttribute(id)}" name="${escapeAttribute(id)}">
        ${options
          .map((item) => {
            const option = typeof item === "string" ? { value: item, label: item } : item;
            return `<option value="${escapeAttribute(option.value)}" ${
              option.value === currentValue ? "selected" : ""
            }>${escapeHtml(option.label)}</option>`;
          })
          .join("")}
      </select>
    `;
  }

  function focusModalField(selector) {
    window.requestAnimationFrame(() => {
      const node = document.querySelector(selector) || document.querySelector("[data-autofocus]");

      if (
        node instanceof HTMLInputElement ||
        node instanceof HTMLTextAreaElement ||
        node instanceof HTMLSelectElement
      ) {
        node.focus();
        if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
          node.select();
        }
      }
    });
  }

  function getSuggestedExecutorId(equipmentId = "") {
    const equipment = model.equipment.find((item) => item.id === equipmentId);

    if (equipment?.type === "Сетевое оборудование") {
      return "exec-01";
    }

    if (equipment?.type === "Сервер") {
      return "exec-02";
    }

    if (["Периферия", "Монитор"].includes(equipment?.type)) {
      return "exec-03";
    }

    const nextExecutor = [...model.workload].sort((a, b) => a.load - b.load)[0];
    return data.executors.find((item) => item.name === nextExecutor?.name)?.id || data.executors[0]?.id || "";
  }

  function getSuggestedEquipmentInventory() {
    return `PC-${String(getNextEquipmentSequence()).padStart(3, "0")}`;
  }

  function getNextEquipmentSequence() {
    return (
      data.equipment.reduce((maxValue, item) => {
        const match = item.inventory.match(/(\d+)$/);
        return match ? Math.max(maxValue, Number(match[1])) : maxValue;
      }, 0) + 1
    );
  }

  function buildEquipmentRecordId(inventory) {
    const normalized = String(inventory || "")
      .toUpperCase()
      .replace(/[^A-Z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!data.equipment.some((item) => item.id === normalized)) {
      return normalized || `ASSET-${Date.now()}`;
    }

    let suffix = 2;
    while (data.equipment.some((item) => item.id === `${normalized}-${suffix}`)) {
      suffix += 1;
    }

    return `${normalized}-${suffix}`;
  }

  function getNextTicketId(offset = 0) {
    const nextValue =
      data.tickets.reduce((maxValue, item) => {
        const match = item.id.match(/(\d+)$/);
        return match ? Math.max(maxValue, Number(match[1])) : maxValue;
      }, 100) +
      1 +
      offset;

    return `INC-${nextValue}`;
  }

  function openModal(content, options = {}) {
    const modal = document.getElementById("appModal");
    const container = document.getElementById("appModalContent");
    const dialog = modal ? modal.querySelector(".modal__dialog") : null;

    if (!modal || !container) {
      return;
    }

    modalReturnFocusNode = options.returnFocus || null;
    container.innerHTML = content;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    if (dialog) {
      dialog.classList.toggle("modal__dialog--command", options.variant === "command");
    }

    applyRoleAccessToDom();
  }

  function closeModal() {
    const modal = document.getElementById("appModal");
    const container = document.getElementById("appModalContent");
    const dialog = modal ? modal.querySelector(".modal__dialog") : null;

    if (!modal || !container) {
      return;
    }

    container.innerHTML = "";
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");

    if (dialog) {
      dialog.classList.remove("modal__dialog--command");
    }

    pendingConfirmAction = null;

    if (modalReturnFocusNode && typeof modalReturnFocusNode.focus === "function") {
      modalReturnFocusNode.focus();
    }

    modalReturnFocusNode = null;
  }

  function modalShell(title, content) {
    return `
      <h3>${escapeHtml(title)}</h3>
      ${content}
    `;
  }

  function modalField(label, value) {
    return `
      <div class="field">
        <label>${escapeHtml(label)}</label>
        <input type="text" value="${escapeAttribute(value)}" readonly />
      </div>
    `;
  }

  function editableField(label, controlMarkup) {
    return `
      <div class="setting-field">
        <label>${escapeHtml(label)}</label>
        ${controlMarkup}
      </div>
    `;
  }

  function settingsToggle(id, title, text, checked) {
    return `
      <label class="setting-toggle" for="${escapeAttribute(id)}">
        <input id="${escapeAttribute(id)}" type="checkbox" ${checked ? "checked" : ""} />
        <span class="setting-toggle__control" aria-hidden="true"></span>
        <span class="setting-toggle__body">
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(text)}</small>
        </span>
      </label>
    `;
  }

  function renderOptions(items, currentValue) {
    return items
      .map((item) => {
        return `<option value="${escapeAttribute(item.value)}" ${
          item.value === currentValue ? "selected" : ""
        }>${escapeHtml(item.label)}</option>`;
      })
      .join("");
  }

  function ticketStatusBadge(status) {
    return `<span class="badge ${{
      новая: "badge--status-new",
      "в работе": "badge--status-work",
      ожидает: "badge--status-wait",
      закрыта: "badge--status-closed",
      просрочена: "badge--status-overdue",
    }[status]}">${escapeHtml(status)}</span>`;
  }

  function equipmentStatusBadge(status) {
    return `<span class="badge ${{
      "в эксплуатации": "badge--equip-live",
      "на обслуживании": "badge--equip-service",
      "в ремонте": "badge--equip-repair",
      списано: "badge--equip-archive",
    }[status]}">${escapeHtml(status)}</span>`;
  }

  function priorityBadge(priority) {
    return `<span class="badge ${{
      низкий: "badge--priority-low",
      средний: "badge--priority-medium",
      высокий: "badge--priority-high",
      критический: "badge--priority-critical",
    }[priority]}">${escapeHtml(priority)}</span>`;
  }

  function buildMonthlyTrend(items) {
    const months = [
      { key: "2026-01", label: "янв" },
      { key: "2026-02", label: "фев" },
      { key: "2026-03", label: "мар" },
      { key: "2026-04", label: "апр" },
    ];

    return months.map((month) => {
      return {
        label: month.label,
        opened: items.filter((item) => item.openedAt.startsWith(month.key)).length,
        closed: items.filter((item) => item.closedAt && item.closedAt.startsWith(month.key)).length,
      };
    });
  }

  function toBreakdown(items, key) {
    const map = items.reduce((acc, item) => {
      acc[item[key]] = (acc[item[key]] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }

  function getEquipmentRecommendation(item, incidentCount, age) {
    if (item.status === "в ремонте" && age >= 5) {
      return {
        short: "подготовить замену",
        text: "Оборудование находится в ремонте и имеет значительный срок эксплуатации. Рационально оценить замену вместо повторных ремонтов.",
      };
    }

    if (incidentCount >= 2 && age >= 4) {
      return {
        short: "назначить диагностику",
        text: "По технике наблюдаются повторяющиеся инциденты. Требуется внеплановая диагностика и анализ причин отказов.",
      };
    }

    if (item.status === "на обслуживании") {
      return {
        short: "завершить обслуживание",
        text: "Необходимо выполнить сервисные работы и подтвердить возврат техники в рабочее состояние.",
      };
    }

    if (item.status === "списано") {
      return {
        short: "архивная запись",
        text: "Техника выведена из эксплуатации и сохранена в системе для полноты учёта и истории инцидентов.",
      };
    }

    if (age >= 6) {
      return {
        short: "контроль ресурса",
        text: "Высокий срок эксплуатации требует планового контроля производительности и подготовки к модернизации.",
      };
    }

    return {
      short: "плановый контроль",
      text: "Оборудование находится в штатной эксплуатации и требует регламентного контроля и профилактики.",
    };
  }

  function fillSelect(node, values, defaultLabel) {
    if (!node) {
      return;
    }

    node.innerHTML = [`<option value="">${escapeHtml(defaultLabel)}</option>`]
      .concat(values.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`))
      .join("");
  }

  function uniqueValues(items, key) {
    return [...new Set(items.map((item) => item[key]))].sort((a, b) => a.localeCompare(b, "ru"));
  }

  function countEnabledRules(map) {
    return Object.values(map).filter((value) => typeof value === "boolean" && value).length;
  }

  function countSignalChannels(map) {
    return Object.entries(map).filter(
      ([key, value]) => key !== "dailyDigest" && typeof value === "boolean" && value
    ).length;
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  function prepareSearchEntry(item) {
    const titleText = normalizeSearchText(item.title);
    const textText = normalizeSearchText(item.text);
    const metaText = normalizeSearchText(item.meta);
    const keywordText = normalizeSearchText(item.keywords || "");

    return {
      ...item,
      titleText,
      metaText,
      searchText: [titleText, textText, metaText, keywordText].filter(Boolean).join(" "),
    };
  }

  function tokenizeSearch(value) {
    return normalizeSearchText(value)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function applyReferenceDate() {
    document.querySelectorAll("[data-reference-date]").forEach((node) => {
      node.textContent = formatDate(referenceDate);
    });
  }

  function yearsInService(dateString) {
    const diff = referenceDate.getTime() - new Date(dateString).getTime();
    return Math.max(0, Math.round(diff / (365.25 * 24 * 60 * 60 * 1000)));
  }

  function hoursBetween(start, end) {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return Math.max(1, Math.round(diff / (1000 * 60 * 60)));
  }

  function formatDate(value, withTime) {
    const options = withTime
      ? {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      : {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        };

    return new Intl.DateTimeFormat("ru-RU", options).format(new Date(value));
  }

  function formatDraftTime(value) {
    if (!value) {
      return "";
    }

    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function formatDraftShortTime(value) {
    if (!value) {
      return "";
    }

    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getCss(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function formatEnvironmentLabel(value) {
    return {
      production: "Production",
      staging: "Staging",
      pilot: "Pilot",
    }[value] || "Production";
  }

  function pluralize(value, forms) {
    const remainder10 = value % 10;
    const remainder100 = value % 100;

    if (remainder10 === 1 && remainder100 !== 11) {
      return forms[0];
    }

    if (remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 12 || remainder100 > 14)) {
      return forms[1];
    }

    return forms[2];
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
