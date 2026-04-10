/**
 * app.js — Gantt chart application logic
 * 
 * Wires dhtmlxGantt to the mock OData service, with:
 *   - Person view / Machine view toggle
 *   - Drag & drop rescheduling
 *   - Pending changes tracking & publish workflow
 *   - Hourly / daily / weekly scale switching
 *   - Color-coding by priority and status
 */

// ──────────────────────────────────────────
//  STATE
// ──────────────────────────────────────────
let currentView = "person";       // "person" | "machine"
let currentScale = "day";         // "hour" | "day" | "week"
let allOrders = [];
let allWorkers = [];
let allMachines = [];
let changeCount = 0;

// ──────────────────────────────────────────
//  GANTT CONFIGURATION
// ──────────────────────────────────────────
function configureGantt() {
    // General settings
    gantt.config.date_format = "%Y-%m-%d %H:%i";
    gantt.config.fit_tasks = true;
    gantt.config.auto_scheduling = false;
    gantt.config.drag_move = true;
    gantt.config.drag_resize = true;
    gantt.config.drag_progress = false;
    gantt.config.drag_links = false;
    gantt.config.details_on_dblclick = false;
    gantt.config.row_height = 48;
    gantt.config.bar_height = 34;
    gantt.config.min_column_width = 40;
    gantt.config.grid_width = 580;
    gantt.config.open_tree_initially = true;
    gantt.config.show_progress = true;
    gantt.config.sort = true;

    // Enable grid and column resizing
    gantt.config.grid_resize = true;
    gantt.config.grid_elastic_columns = true;

    // Columns in the left grid — show full scheduled run details
    gantt.config.columns = [
        { name: "text", label: "Test Order / Resource", tree: true, width: 180, resize: true,
            template: function (task) {
                if (task.type === "project") return "<b>" + task.text + "</b>";
                return '<span class="grid-order-id">' + (task.prodOrderId || "") + '</span> ' +
                    '<span class="grid-item-name">' + task.text + '</span>';
            }
        },
        {
            name: "item_number", label: "Item #", align: "center", width: 70, resize: true,
            template: function (task) {
                return task.itemNumber || "";
            }
        },
        {
            name: "qty_col", label: "Qty", align: "center", width: 50, resize: true,
            template: function (task) {
                return task.quantity ? task.quantity + "" : "";
            }
        },
        {
            name: "hours", label: "Est / Act", align: "center", width: 65, resize: true,
            template: function (task) {
                if (!task.estimatedHours) return "";
                return task.actualHours + "/" + task.estimatedHours + "h";
            }
        },
        {
            name: "status_col", label: "Status", align: "center", width: 80, resize: true,
            template: function (task) {
                if (!task.orderStatus) return "";
                const cls = "status-badge status-" + task.orderStatus.toLowerCase();
                return '<span class="' + cls + '">' + task.orderStatus + '</span>';
            }
        },
        {
            name: "priority_col", label: "Priority", align: "center", width: 65, resize: true,
            template: function (task) {
                if (!task.priority) return "";
                const cls = "priority-badge priority-" + task.priority.toLowerCase();
                return '<span class="' + cls + '">' + task.priority + '</span>';
            }
        },
        {
            name: "resource_col", label: "Resource", align: "left", width: 110, resize: true,
            template: function (task) {
                if (task.type === "project") return "";
                // In Technician view show instrument, in Instrument view show technician
                if (currentView === "person") {
                    const m = allMachines.find(x => x.id === task.assignedMachine);
                    return m ? '<span class="grid-resource machine">' + m.name + '</span>' : "";
                } else {
                    const w = allWorkers.find(x => x.id === task.assignedWorker);
                    return w ? '<span class="grid-resource worker">' + w.name + '</span>' : "";
                }
            }
        }
    ];

    // Timeline scale — default to Day
    setScaleConfig("day");

    // Task bar templates
    gantt.templates.task_class = function (start, end, task) {
        const classes = [];
        if (task.priority) classes.push("priority-" + task.priority.toLowerCase());
        if (task.orderStatus) classes.push("status-" + task.orderStatus.toLowerCase());
        if (task.$modified) classes.push("task-modified");
        return classes.join(" ");
    };

    gantt.templates.task_text = function (start, end, task) {
        if (task.type === "project") return "";
        let txt = '<span class="bar-order-id">' + (task.prodOrderId || "") + '</span> ';
        txt += task.text;
        txt += ' <span class="bar-qty">' + (task.quantity || "") + " " + (task.unitOfMeasure || "") + '</span>';
        return txt;
    };

    gantt.templates.tooltip_text = function (start, end, task) {
        if (task.type === "project") return "<b>" + task.text + "</b>";
        let html = '<div class="gantt-tooltip-custom">';
        html += '<div class="tt-header">' + (task.prodOrderId || "") + ' — ' + task.text + '</div>';
        html += '<table class="tt-table">';
        html += '<tr><td class="tt-label">Item #</td><td>' + (task.itemNumber || "") + '</td></tr>';
        html += '<tr><td class="tt-label">Quantity</td><td>' + (task.quantity || "") + ' ' + (task.unitOfMeasure || "") + '</td></tr>';
        html += '<tr><td class="tt-label">Status</td><td>' + (task.orderStatus || "") + '</td></tr>';
        html += '<tr><td class="tt-label">Priority</td><td>' + (task.priority || "") + '</td></tr>';
        // Resolve worker & machine names
        var wkr = allWorkers.find(function(w){ return w.id === task.assignedWorker; });
        var mch = allMachines.find(function(m){ return m.id === task.assignedMachine; });
        html += '<tr><td class="tt-label">Technician</td><td>' + (wkr ? wkr.name : 'Unassigned') + '</td></tr>';
        html += '<tr><td class="tt-label">Instrument</td><td>' + (mch ? mch.name : 'N/A') + '</td></tr>';
        html += '<tr><td class="tt-label">Est. Hours</td><td>' + (task.estimatedHours || 0) + 'h</td></tr>';
        html += '<tr><td class="tt-label">Actual Hours</td><td>' + (task.actualHours || 0) + 'h</td></tr>';
        html += '<tr><td class="tt-label">Progress</td><td>' + Math.round((task.progress || 0) * 100) + '%</td></tr>';
        html += '<tr><td class="tt-label">Start</td><td>' + gantt.templates.tooltip_date_format(start) + '</td></tr>';
        html += '<tr><td class="tt-label">End</td><td>' + gantt.templates.tooltip_date_format(end) + '</td></tr>';
        html += '</table>';
        // Route operations summary
        if (task.routeOperations && task.routeOperations.length) {
            html += '<div class="tt-ops-header">Processing Steps</div>';
            task.routeOperations.forEach(function(op) {
                var opMachine = allMachines.find(function(m){ return m.id === op.machine; });
                html += '<div class="tt-op">Op ' + op.opId + ': ' + op.opName + ' — ' + op.hours + 'h' +
                    (opMachine ? ' (' + opMachine.name + ')' : '') + '</div>';
            });
        }
        if (task.$modified) html += '<div class="tt-modified">⦿ Modified — pending publish</div>';
        html += '</div>';
        return html;
    };

    gantt.templates.tooltip_date_format = gantt.date.date_to_str("%b %d, %Y %H:%i");

    // Right-side text on bars — show resource + modified indicator
    gantt.templates.rightside_text = function (start, end, task) {
        if (task.type === "project") return "";
        let parts = [];
        // Show the complementary resource (instrument in technician view, technician in instrument view)
        if (currentView === "person") {
            const m = allMachines.find(x => x.id === task.assignedMachine);
            if (m) parts.push('<span class="bar-resource">' + m.name + '</span>');
        } else {
            const w = allWorkers.find(x => x.id === task.assignedWorker);
            if (w) parts.push('<span class="bar-resource">' + w.name + '</span>');
        }
        if (task.$modified) parts.push('<span class="modified-indicator">● modified</span>');
        return parts.join(" ");
    };

    // Grid row class for groups
    gantt.templates.grid_row_class = function (start, end, task) {
        if (task.type === "project") return "resource-row";
        return "";
    };
}

// ──────────────────────────────────────────
//  SCALE CONFIG
// ──────────────────────────────────────────
function setScaleConfig(scale) {
    gantt.config.subscales = [];

    if (scale === "hour") {
        gantt.config.scale_unit = "day";
        gantt.config.date_scale = "%d %M %Y";
        gantt.config.subscales = [
            { unit: "hour", step: 1, date: "%H:%i" }
        ];
        gantt.config.min_column_width = 40;
        gantt.config.scale_height = 50;
    } else if (scale === "day") {
        gantt.config.scale_unit = "week";
        gantt.config.date_scale = "Week %W - %M %Y";
        gantt.config.subscales = [
            { unit: "day", step: 1, date: "%d %D" }
        ];
        gantt.config.min_column_width = 60;
        gantt.config.scale_height = 50;
    } else if (scale === "week") {
        gantt.config.scale_unit = "month";
        gantt.config.date_scale = "%F %Y";
        gantt.config.subscales = [
            { unit: "week", step: 1, date: "Wk %W" }
        ];
        gantt.config.min_column_width = 80;
        gantt.config.scale_height = 50;
    }
}

function setScale(scale, e) {
    currentScale = scale;
    setScaleConfig(scale);
    gantt.render();

    // Update button active states
    document.querySelectorAll(".scale-btn").forEach(btn => btn.classList.remove("active"));
    if (e && e.target) e.target.classList.add("active");
}

// ──────────────────────────────────────────
//  VIEW SWITCHING (Person / Machine)
// ──────────────────────────────────────────
function switchView(view) {
    currentView = view;

    document.getElementById("btn-person").classList.toggle("active", view === "person");
    document.getElementById("btn-machine").classList.toggle("active", view === "machine");

    buildGanttData();
}

// ──────────────────────────────────────────
//  DATA BUILDING — transforms orders into Gantt tasks grouped by resource
// ──────────────────────────────────────────
function buildGanttData() {
    const tasks = [];
    const links = [];

    if (currentView === "person") {
        // Group by worker
        allWorkers.forEach(worker => {
            tasks.push({
                id: "grp_" + worker.id,
                text: worker.name + " (" + worker.department + ")",
                type: "project",
                open: true
            });

            const workerOrders = allOrders.filter(o => o.assignedWorker === worker.id);
            workerOrders.forEach(order => {
                tasks.push(orderToTask(order, "grp_" + worker.id));
            });
        });

        // Unassigned
        const unassigned = allOrders.filter(o => !o.assignedWorker);
        if (unassigned.length) {
            tasks.push({ id: "grp_unassigned", text: "Unassigned", type: "project", open: true });
            unassigned.forEach(order => {
                tasks.push(orderToTask(order, "grp_unassigned"));
            });
        }
    } else {
        // Group by machine
        allMachines.forEach(machine => {
            tasks.push({
                id: "grp_" + machine.id,
                text: machine.name + " (" + machine.type + ")",
                type: "project",
                open: true
            });

            const machineOrders = allOrders.filter(o => o.assignedMachine === machine.id);
            machineOrders.forEach(order => {
                tasks.push(orderToTask(order, "grp_" + machine.id));
            });
        });

        const unassigned = allOrders.filter(o => !o.assignedMachine);
        if (unassigned.length) {
            tasks.push({ id: "grp_unassigned", text: "Unassigned", type: "project", open: true });
            unassigned.forEach(order => {
                tasks.push(orderToTask(order, "grp_unassigned"));
            });
        }
    }

    gantt.clearAll();
    gantt.parse({ data: tasks, links: links });
    gantt.sort("start_date", false);
}

function orderToTask(order, parentId) {
    const progress = order.actualHours / (order.estimatedHours || 1);
    return {
        id: order.id,
        text: order.itemName,
        start_date: new Date(order.scheduledStart),
        end_date: new Date(order.scheduledEnd),
        parent: parentId,
        progress: Math.min(progress, 1),
        priority: order.priority,
        orderStatus: order.status,
        prodOrderId: order.prodOrderId,
        itemNumber: order.itemNumber,
        quantity: order.quantity,
        unitOfMeasure: order.unitOfMeasure,
        estimatedHours: order.estimatedHours,
        actualHours: order.actualHours,
        assignedWorker: order.assignedWorker,
        assignedMachine: order.assignedMachine,
        routeOperations: order.routeOperations,
        $modified: false
    };
}

// ──────────────────────────────────────────
//  DRAG & DROP HANDLERS
// ──────────────────────────────────────────
function setupDragHandlers() {
    // After a task is dragged (move or resize)
    gantt.attachEvent("onAfterTaskDrag", function (id, mode) {
        const task = gantt.getTask(id);
        if (task.type === "project") return;

        task.$modified = true;
        gantt.refreshTask(id);

        // Update the underlying order data
        const order = allOrders.find(o => o.id === id);
        if (order) {
            order.scheduledStart = task.start_date;
            order.scheduledEnd = task.end_date;
        }

        // Record change in service
        ODataService.updateProductionOrder(id, {
            scheduledStart: task.start_date.toISOString(),
            scheduledEnd: task.end_date.toISOString()
        });

        updateChangesBar();
    });

    // Double-click to show order detail
    gantt.attachEvent("onTaskDblClick", function (id) {
        const task = gantt.getTask(id);
        if (task.type === "project") return true;
        showOrderDetail(task);
        return false;
    });

    // Right-click context menu on tasks
    gantt.attachEvent("onContextMenu", function (taskId, linkId, event) {
        if (taskId) {
            const task = gantt.getTask(taskId);
            if (task.type === "project") return true;
            event.preventDefault();
            showJobContextMenu(taskId, event);
            return false;
        }
        return true;
    });
}

// ──────────────────────────────────────────
//  JOB CONTEXT MENU
// ──────────────────────────────────────────
let contextMenuTaskId = null;

function showJobContextMenu(taskId, event) {
    contextMenuTaskId = taskId;
    const menu = document.getElementById("job-context-menu");

    // Position the menu at the click point
    menu.style.left = event.clientX + "px";
    menu.style.top = event.clientY + "px";
    menu.classList.remove("hidden");

    // Adjust if menu would go off-screen
    requestAnimationFrame(function () {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (event.clientX - rect.width) + "px";
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (event.clientY - rect.height) + "px";
        }
    });
}

function hideJobContextMenu() {
    document.getElementById("job-context-menu").classList.add("hidden");
    contextMenuTaskId = null;
}

// Close context menu on any click outside
document.addEventListener("click", function () {
    hideJobContextMenu();
});

document.addEventListener("contextmenu", function (e) {
    // If clicking outside the gantt task area, close the menu
    const menu = document.getElementById("job-context-menu");
    if (!menu.classList.contains("hidden") && !menu.contains(e.target)) {
        hideJobContextMenu();
    }
});

// Handle context menu item clicks
document.addEventListener("DOMContentLoaded", function () {
    const menu = document.getElementById("job-context-menu");
    menu.addEventListener("click", function (e) {
        const item = e.target.closest(".context-menu-item");
        if (!item || !contextMenuTaskId) return;

        const action = item.getAttribute("data-action");
        const task = gantt.getTask(contextMenuTaskId);
        hideJobContextMenu();

        switch (action) {
            case "schedule-from-material":
                scheduleFromMaterial(task);
                break;
            case "schedule-previous":
                schedulePreviousJobs(task);
                break;
            case "schedule-next":
                scheduleNextJobs(task);
                break;
            case "schedule-around":
                scheduleAroundJob(task);
                break;
            case "toggle-highlight":
                toggleOrderHighlight(task);
                break;
            case "capacity-load":
                showCapacityLoad(task);
                break;
        }
    });
});

// ── Context menu action handlers ──

function scheduleFromMaterial(task) {
    const status = document.getElementById("status-indicator");
    // Simulate scheduling from material availability date
    status.textContent = "Scheduling " + task.prodOrderId + " from material availability…";
    status.className = "status-indicator publishing";

    setTimeout(function () {
        // Move task start to a simulated material availability date (e.g. +1 day)
        const newStart = new Date(task.start_date);
        newStart.setDate(newStart.getDate() + 1);
        const duration = task.end_date - task.start_date;
        const newEnd = new Date(newStart.getTime() + duration);

        task.start_date = newStart;
        task.end_date = newEnd;
        task.$modified = true;
        gantt.updateTask(task.id);

        const order = allOrders.find(o => o.id === task.id);
        if (order) {
            order.scheduledStart = newStart;
            order.scheduledEnd = newEnd;
        }
        ODataService.updateProductionOrder(task.id, {
            scheduledStart: newStart.toISOString(),
            scheduledEnd: newEnd.toISOString()
        });
        updateChangesBar();

        status.textContent = task.prodOrderId + " rescheduled from material availability";
        status.className = "status-indicator success";
        setTimeout(() => { status.textContent = "Ready"; status.className = "status-indicator"; }, 3000);
    }, 500);
}

function schedulePreviousJobs(task) {
    const status = document.getElementById("status-indicator");
    status.textContent = "Scheduling previous jobs before " + task.prodOrderId + "…";
    status.className = "status-indicator publishing";

    setTimeout(function () {
        // Find sibling tasks under the same parent that start before this task
        const parentId = task.parent;
        const siblings = [];
        gantt.eachTask(function (t) {
            if (t.parent === parentId && t.id !== task.id && t.type !== "project" && t.start_date < task.start_date) {
                siblings.push(t);
            }
        });

        // Stack them sequentially ending at this task's start
        siblings.sort((a, b) => a.start_date - b.start_date);
        let cursor = new Date(task.start_date);
        for (let i = siblings.length - 1; i >= 0; i--) {
            const sib = siblings[i];
            const duration = sib.end_date - sib.start_date;
            const newEnd = new Date(cursor);
            const newStart = new Date(cursor.getTime() - duration);
            sib.start_date = newStart;
            sib.end_date = newEnd;
            sib.$modified = true;
            gantt.updateTask(sib.id);

            const order = allOrders.find(o => o.id === sib.id);
            if (order) { order.scheduledStart = newStart; order.scheduledEnd = newEnd; }
            ODataService.updateProductionOrder(sib.id, {
                scheduledStart: newStart.toISOString(),
                scheduledEnd: newEnd.toISOString()
            });
            cursor = newStart;
        }

        updateChangesBar();
        status.textContent = siblings.length + " previous job(s) rescheduled";
        status.className = "status-indicator success";
        setTimeout(() => { status.textContent = "Ready"; status.className = "status-indicator"; }, 3000);
    }, 500);
}

function scheduleNextJobs(task) {
    const status = document.getElementById("status-indicator");
    status.textContent = "Scheduling next jobs after " + task.prodOrderId + "…";
    status.className = "status-indicator publishing";

    setTimeout(function () {
        const parentId = task.parent;
        const siblings = [];
        gantt.eachTask(function (t) {
            if (t.parent === parentId && t.id !== task.id && t.type !== "project" && t.start_date >= task.start_date) {
                siblings.push(t);
            }
        });

        // Stack them sequentially starting from this task's end
        siblings.sort((a, b) => a.start_date - b.start_date);
        let cursor = new Date(task.end_date);
        siblings.forEach(function (sib) {
            const duration = sib.end_date - sib.start_date;
            const newStart = new Date(cursor);
            const newEnd = new Date(cursor.getTime() + duration);
            sib.start_date = newStart;
            sib.end_date = newEnd;
            sib.$modified = true;
            gantt.updateTask(sib.id);

            const order = allOrders.find(o => o.id === sib.id);
            if (order) { order.scheduledStart = newStart; order.scheduledEnd = newEnd; }
            ODataService.updateProductionOrder(sib.id, {
                scheduledStart: newStart.toISOString(),
                scheduledEnd: newEnd.toISOString()
            });
            cursor = newEnd;
        });

        updateChangesBar();
        status.textContent = siblings.length + " next job(s) rescheduled";
        status.className = "status-indicator success";
        setTimeout(() => { status.textContent = "Ready"; status.className = "status-indicator"; }, 3000);
    }, 500);
}

function scheduleAroundJob(task) {
    const status = document.getElementById("status-indicator");
    status.textContent = "Scheduling around " + task.prodOrderId + "…";
    status.className = "status-indicator publishing";

    setTimeout(function () {
        const parentId = task.parent;
        const before = [];
        const after = [];

        gantt.eachTask(function (t) {
            if (t.parent === parentId && t.id !== task.id && t.type !== "project") {
                if (t.start_date < task.start_date) before.push(t);
                else after.push(t);
            }
        });

        // Pack jobs before this one ending at task start
        before.sort((a, b) => a.start_date - b.start_date);
        let cursor = new Date(task.start_date);
        for (let i = before.length - 1; i >= 0; i--) {
            const sib = before[i];
            const duration = sib.end_date - sib.start_date;
            const newEnd = new Date(cursor);
            const newStart = new Date(cursor.getTime() - duration);
            sib.start_date = newStart;
            sib.end_date = newEnd;
            sib.$modified = true;
            gantt.updateTask(sib.id);

            const order = allOrders.find(o => o.id === sib.id);
            if (order) { order.scheduledStart = newStart; order.scheduledEnd = newEnd; }
            ODataService.updateProductionOrder(sib.id, {
                scheduledStart: newStart.toISOString(),
                scheduledEnd: newEnd.toISOString()
            });
            cursor = newStart;
        }

        // Pack jobs after this one starting at task end
        after.sort((a, b) => a.start_date - b.start_date);
        cursor = new Date(task.end_date);
        after.forEach(function (sib) {
            const duration = sib.end_date - sib.start_date;
            const newStart = new Date(cursor);
            const newEnd = new Date(cursor.getTime() + duration);
            sib.start_date = newStart;
            sib.end_date = newEnd;
            sib.$modified = true;
            gantt.updateTask(sib.id);

            const order = allOrders.find(o => o.id === sib.id);
            if (order) { order.scheduledStart = newStart; order.scheduledEnd = newEnd; }
            ODataService.updateProductionOrder(sib.id, {
                scheduledStart: newStart.toISOString(),
                scheduledEnd: newEnd.toISOString()
            });
            cursor = newEnd;
        });

        updateChangesBar();
        const total = before.length + after.length;
        status.textContent = total + " job(s) rescheduled around " + task.prodOrderId;
        status.className = "status-indicator success";
        setTimeout(() => { status.textContent = "Ready"; status.className = "status-indicator"; }, 3000);
    }, 500);
}

function toggleOrderHighlight(task) {
    task.$highlighted = !task.$highlighted;
    // Toggle a CSS class on the task bar
    const el = document.querySelector('[' + gantt.config.task_attribute + '="' + task.id + '"]');
    if (el) {
        el.classList.toggle("order-highlighted", task.$highlighted);
    }
}

function showCapacityLoad(task) {
    // Show a capacity load summary for the resource this job is assigned to
    const resourceId = currentView === "person" ? task.assignedWorker : task.assignedMachine;
    const resourceList = currentView === "person" ? allWorkers : allMachines;
    const resource = resourceList.find(r => r.id === resourceId);
    const resourceName = resource ? resource.name : "Unknown";

    // Gather all tasks for this resource
    let totalEstHours = 0;
    let totalActHours = 0;
    let taskCount = 0;

    allOrders.forEach(function (o) {
        const match = currentView === "person"
            ? o.assignedWorker === resourceId
            : o.assignedMachine === resourceId;
        if (match) {
            totalEstHours += o.estimatedHours || 0;
            totalActHours += o.actualHours || 0;
            taskCount++;
        }
    });

    const utilization = totalEstHours > 0 ? Math.round((totalActHours / totalEstHours) * 100) : 0;

    let html = '<div class="detail-grid">';
    html += '<div class="detail-label">Resource</div><div class="detail-value"><b>' + resourceName + '</b></div>';
    html += '<div class="detail-label">Assigned Jobs</div><div class="detail-value">' + taskCount + '</div>';
    html += '<div class="detail-label">Total Est. Hours</div><div class="detail-value">' + totalEstHours.toFixed(1) + 'h</div>';
    html += '<div class="detail-label">Total Act. Hours</div><div class="detail-value">' + totalActHours.toFixed(1) + 'h</div>';
    html += '<div class="detail-label">Utilization</div><div class="detail-value">' + utilization + '%</div>';
    html += '</div>';

    document.getElementById("detail-title").textContent = "Capacity Load — " + resourceName;
    document.getElementById("detail-body").innerHTML = html;
    document.getElementById("order-detail").classList.remove("hidden");
}

// ──────────────────────────────────────────
//  CHANGES BAR & PUBLISH
// ──────────────────────────────────────────
function updateChangesBar() {
    const changes = ODataService.getPendingChanges();
    changeCount = changes.length;
    const bar = document.getElementById("changes-bar");
    const count = document.getElementById("changes-count");

    if (changeCount > 0) {
        bar.classList.remove("hidden");
        count.textContent = changeCount;
    } else {
        bar.classList.add("hidden");
    }
}

async function publishChanges() {
    const btn = document.getElementById("btn-publish");
    const status = document.getElementById("status-indicator");

    btn.disabled = true;
    btn.textContent = "Publishing...";
    status.textContent = "Publishing...";
    status.className = "status-indicator publishing";

    try {
        const result = await ODataService.publishAllChanges();

        status.textContent = result.message;
        status.className = "status-indicator success";

        // Clear modified flags on all tasks
        gantt.eachTask(function (task) {
            if (task.$modified) {
                task.$modified = false;
                gantt.refreshTask(task.id);
            }
        });

        updateChangesBar();

        setTimeout(() => {
            status.textContent = "Ready";
            status.className = "status-indicator";
        }, 3000);
    } catch (err) {
        status.textContent = "Publish failed!";
        status.className = "status-indicator error";
        console.error("Publish error:", err);
    } finally {
        btn.disabled = false;
        btn.textContent = "↑ Publish to D365";
    }
}

async function refreshData() {
    const status = document.getElementById("status-indicator");
    status.textContent = "Loading...";
    status.className = "status-indicator publishing";

    try {
        allOrders = await ODataService.getProductionOrders();
        allWorkers = await ODataService.getWorkers();
        allMachines = await ODataService.getMachines();
        buildGanttData();

        status.textContent = "Data refreshed";
        status.className = "status-indicator success";
        setTimeout(() => {
            status.textContent = "Ready";
            status.className = "status-indicator";
        }, 2000);
    } catch (err) {
        status.textContent = "Refresh failed!";
        status.className = "status-indicator error";
        console.error(err);
    }
}

async function discardChanges() {
    await ODataService.discardAllChanges();
    updateChangesBar();
    refreshData();
}

// ──────────────────────────────────────────
//  MODALS
// ──────────────────────────────────────────
function showPendingChanges() {
    const changes = ODataService.getPendingChanges();
    const list = document.getElementById("changes-list");

    let html = '<table class="changes-table"><thead><tr>' +
        '<th>Order</th><th>Description</th><th>Change</th><th>Time</th>' +
        '</tr></thead><tbody>';

    changes.forEach(c => {
        html += '<tr>';
        html += '<td><strong>' + c.orderId + '</strong></td>';
        html += '<td>' + c.orderName + '</td>';
        html += '<td>';
        if (c.changes.scheduledStart) {
            html += 'Start: ' + new Date(c.changes.scheduledStart).toLocaleString() + '<br/>';
        }
        if (c.changes.scheduledEnd) {
            html += 'End: ' + new Date(c.changes.scheduledEnd).toLocaleString();
        }
        html += '</td>';
        html += '<td>' + c.timestamp.toLocaleTimeString() + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table>';
    list.innerHTML = html;

    document.getElementById("changes-modal").classList.remove("hidden");
}

function closeModal() {
    document.getElementById("changes-modal").classList.add("hidden");
}

function showOrderDetail(task) {
    document.getElementById("detail-title").textContent =
        task.prodOrderId + " — " + task.text;

    let html = '<div class="detail-grid">';
    html += detailRow("Production Order", task.prodOrderId);
    html += detailRow("Item Number", task.itemNumber);
    html += detailRow("Item Name", task.text);
    html += detailRow("Quantity", task.quantity + " " + (task.unitOfMeasure || "ea"));
    html += detailRow("Status", '<span class="status-badge status-' +
        (task.orderStatus || "").toLowerCase() + '">' + task.orderStatus + '</span>');
    html += detailRow("Priority", '<span class="priority-badge priority-' +
        (task.priority || "").toLowerCase() + '">' + task.priority + '</span>');
    html += detailRow("Scheduled Start", task.start_date.toLocaleString());
    html += detailRow("Scheduled End", task.end_date.toLocaleString());
    html += detailRow("Estimated Hours", task.estimatedHours + "h");
    html += detailRow("Actual Hours", task.actualHours + "h");
    html += detailRow("Progress", Math.round((task.progress || 0) * 100) + "%");
    html += '</div>';

    // Route operations
    if (task.routeOperations && task.routeOperations.length) {
        html += '<h3 style="margin-top:16px;">Processing Steps</h3>';
        html += '<table class="changes-table"><thead><tr>' +
            '<th>Op #</th><th>Operation</th><th>Instrument</th><th>Hours</th>' +
            '</tr></thead><tbody>';
        task.routeOperations.forEach(op => {
            const machineName = op.machine
                ? (allMachines.find(m => m.id === op.machine) || {}).name || op.machine
                : "Manual";
            html += '<tr><td>' + op.opId + '</td><td>' + op.opName +
                '</td><td>' + machineName + '</td><td>' + op.hours + 'h</td></tr>';
        });
        html += '</tbody></table>';
    }

    document.getElementById("detail-body").innerHTML = html;
    document.getElementById("order-detail").classList.remove("hidden");
}

function detailRow(label, value) {
    return '<div class="detail-label">' + label + '</div><div class="detail-value">' + value + '</div>';
}

function closeOrderDetail() {
    document.getElementById("order-detail").classList.add("hidden");
}

// ──────────────────────────────────────────
//  INITIALIZATION
// ──────────────────────────────────────────
async function init() {
    configureGantt();
    gantt.init("gantt_here");
    setupDragHandlers();
    await refreshData();
}

// Boot
init();
