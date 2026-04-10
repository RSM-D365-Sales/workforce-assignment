/**
 * odata-service.js
 * 
 * Mock OData service layer simulating D365 Finance & Supply Chain Management.
 * 
 * When connecting to real D365, replace the mock implementations with actual
 * fetch() calls to your D365 OData endpoints, e.g.:
 *   GET  https://<your-env>.operations.dynamics.com/data/ProductionOrders
 *   PATCH https://<your-env>.operations.dynamics.com/data/ProductionOrders('<id>')
 * 
 * Auth: Use Azure AD / Entra ID bearer tokens via MSAL.js
 */

const ODataService = (function () {

    // ──────────────────────────────────────────────
    //  CONFIGURATION — swap these for real D365
    // ──────────────────────────────────────────────
    const CONFIG = {
        baseUrl: "https://your-d365-environment.operations.dynamics.com/data",
        // For real D365, you'd set:
        // entitySets: {
        //     productionOrders: "ProductionOrders",
        //     routeOperations: "ProductionOrderRouteOperations",
        //     resources: "WrkCtrTable",           // work center / machines
        //     workers: "HcmWorkerBasicEntity"     // people
        // }
    };

    // ──────────────────────────────────────────────
    //  MOCK DATA — realistic D365 production data
    // ──────────────────────────────────────────────

    const today = new Date();
    const d = (offsetDays, hour = 8) => {
        const dt = new Date(today);
        dt.setDate(dt.getDate() + offsetDays);
        dt.setHours(hour, 0, 0, 0);
        return dt;
    };

    // Workers (resources of type "person") — Lab Technicians / Scientists
    const workers = [
        { id: "W001", name: "Alex Rivera",    department: "Hematology",    shift: "Day" },
        { id: "W002", name: "Jordan Lee",     department: "Chemistry",     shift: "Day" },
        { id: "W003", name: "Sam Patel",      department: "Microbiology",  shift: "Day" },
        { id: "W004", name: "Casey Zhang",    department: "Molecular",     shift: "Night" },
        { id: "W005", name: "Morgan Brooks",  department: "Toxicology",    shift: "Day" },
        { id: "W006", name: "Taylor Kim",     department: "Immunology",    shift: "Night" },
    ];

    // Machines (resources of type "machine") — Laboratory Instruments
    const machines = [
        { id: "M001", name: "Hematology Analyzer",    type: "Analyzer",     capacity: 1 },
        { id: "M002", name: "Chemistry Analyzer",     type: "Analyzer",     capacity: 1 },
        { id: "M003", name: "Mass Spectrometer",      type: "Spectrometry", capacity: 1 },
        { id: "M004", name: "PCR Thermal Cycler",     type: "Molecular",    capacity: 1 },
        { id: "M005", name: "Centrifuge Station",     type: "Pre-Analytic", capacity: 3 },
        { id: "M006", name: "Immunoassay Platform",   type: "Immunology",   capacity: 1 },
    ];

    // Test orders with schedule details — Laboratory diagnostic workflows
    let productionOrders = [
        {
            id: "TO-10001", prodOrderId: "TO-10001",
            itemNumber: "CBC-001", itemName: "Complete Blood Count Panel",
            quantity: 48, unitOfMeasure: "samples",
            status: "Scheduled", priority: "High",
            assignedWorker: "W001", assignedMachine: "M001",
            scheduledStart: d(0, 8),  scheduledEnd: d(2, 16),
            estimatedHours: 24, actualHours: 0,
            routeOperations: [
                { opId: 10, opName: "Sample accessioning",    machine: null,   hours: 2 },
                { opId: 20, opName: "Centrifugation",         machine: "M005", hours: 4 },
                { opId: 30, opName: "Hematology analysis",    machine: "M001", hours: 12 },
                { opId: 40, opName: "Result review & QC",     machine: null,   hours: 6 },
            ]
        },
        {
            id: "TO-10002", prodOrderId: "TO-10002",
            itemNumber: "CMP-014", itemName: "Comprehensive Metabolic Panel",
            quantity: 96, unitOfMeasure: "samples",
            status: "Released", priority: "Medium",
            assignedWorker: "W002", assignedMachine: "M002",
            scheduledStart: d(0, 8), scheduledEnd: d(1, 16),
            estimatedHours: 16, actualHours: 4,
            routeOperations: [
                { opId: 10, opName: "Sample prep & aliquot",  machine: "M005", hours: 4 },
                { opId: 20, opName: "Chemistry analysis",     machine: "M002", hours: 8 },
                { opId: 30, opName: "Result validation",      machine: null,   hours: 4 },
            ]
        },
        {
            id: "TO-10003", prodOrderId: "TO-10003",
            itemNumber: "BC-042", itemName: "Blood Culture Analysis",
            quantity: 36, unitOfMeasure: "samples",
            status: "Scheduled", priority: "High",
            assignedWorker: "W003", assignedMachine: "M006",
            scheduledStart: d(1, 8), scheduledEnd: d(3, 12),
            estimatedHours: 20, actualHours: 0,
            routeOperations: [
                { opId: 10, opName: "Inoculation & loading",  machine: null,   hours: 3 },
                { opId: 20, opName: "Incubation monitoring",  machine: "M006", hours: 12 },
                { opId: 30, opName: "Sensitivity testing",    machine: "M003", hours: 5 },
            ]
        },
        {
            id: "TO-10004", prodOrderId: "TO-10004",
            itemNumber: "PCR-007", itemName: "Respiratory Pathogen PCR Panel",
            quantity: 24, unitOfMeasure: "samples",
            status: "Released", priority: "Low",
            assignedWorker: "W004", assignedMachine: "M004",
            scheduledStart: d(2, 8), scheduledEnd: d(3, 16),
            estimatedHours: 16, actualHours: 0,
            routeOperations: [
                { opId: 10, opName: "Nucleic acid extraction", machine: null,   hours: 4 },
                { opId: 20, opName: "PCR amplification",       machine: "M004", hours: 8 },
                { opId: 30, opName: "Result interpretation",   machine: null,   hours: 4 },
            ]
        },
        {
            id: "TO-10005", prodOrderId: "TO-10005",
            itemNumber: "TOX-021", itemName: "Urine Drug Screen Panel",
            quantity: 64, unitOfMeasure: "samples",
            status: "Scheduled", priority: "Medium",
            assignedWorker: "W005", assignedMachine: "M003",
            scheduledStart: d(0, 8), scheduledEnd: d(0, 16),
            estimatedHours: 8, actualHours: 2,
            routeOperations: [
                { opId: 10, opName: "Immunoassay screening",  machine: "M006", hours: 3 },
                { opId: 20, opName: "LC-MS/MS confirmation",  machine: "M003", hours: 3 },
                { opId: 30, opName: "Result reporting",       machine: null,   hours: 2 },
            ]
        },
        {
            id: "TO-10006", prodOrderId: "TO-10006",
            itemNumber: "THY-003", itemName: "Thyroid Function Panel",
            quantity: 40, unitOfMeasure: "samples",
            status: "Scheduled", priority: "High",
            assignedWorker: "W002", assignedMachine: "M006",
            scheduledStart: d(3, 8), scheduledEnd: d(5, 12),
            estimatedHours: 20, actualHours: 0,
            routeOperations: [
                { opId: 10, opName: "Sample centrifugation",  machine: "M005", hours: 2 },
                { opId: 20, opName: "Immunoassay analysis",   machine: "M006", hours: 12 },
                { opId: 30, opName: "Reflex testing & QC",    machine: "M002", hours: 6 },
            ]
        },
        {
            id: "TO-10007", prodOrderId: "TO-10007",
            itemNumber: "LIP-009", itemName: "Lipid Panel with Fractionation",
            quantity: 32, unitOfMeasure: "samples",
            status: "Released", priority: "Medium",
            assignedWorker: "W001", assignedMachine: "M002",
            scheduledStart: d(3, 8), scheduledEnd: d(5, 16),
            estimatedHours: 24, actualHours: 0,
            routeOperations: [
                { opId: 10, opName: "Sample prep & serum sep", machine: "M005", hours: 4 },
                { opId: 20, opName: "Chemistry analysis",      machine: "M002", hours: 8 },
                { opId: 30, opName: "Lipoprotein fractionation", machine: "M003", hours: 8 },
                { opId: 40, opName: "Result review",           machine: null,   hours: 4 },
            ]
        },
        {
            id: "TO-10008", prodOrderId: "TO-10008",
            itemNumber: "HBA-011", itemName: "Hemoglobin A1c Testing",
            quantity: 80, unitOfMeasure: "samples",
            status: "Scheduled", priority: "Low",
            assignedWorker: "W006", assignedMachine: "M001",
            scheduledStart: d(4, 8), scheduledEnd: d(6, 12),
            estimatedHours: 20, actualHours: 0,
            routeOperations: [
                { opId: 10, opName: "EDTA sample prep",        machine: "M005", hours: 4 },
                { opId: 20, opName: "HPLC analysis",           machine: "M001", hours: 10 },
                { opId: 30, opName: "Result validation & QC",  machine: null,   hours: 6 },
            ]
        },
        {
            id: "TO-10009", prodOrderId: "TO-10009",
            itemNumber: "COV-056", itemName: "SARS-CoV-2 RT-PCR Batch",
            quantity: 94, unitOfMeasure: "samples",
            status: "Scheduled", priority: "Medium",
            assignedWorker: "W004", assignedMachine: "M004",
            scheduledStart: d(2, 8), scheduledEnd: d(4, 16),
            estimatedHours: 24, actualHours: 0,
            routeOperations: [
                { opId: 10, opName: "RNA extraction",          machine: null,   hours: 6 },
                { opId: 20, opName: "RT-PCR amplification",    machine: "M004", hours: 10 },
                { opId: 30, opName: "Ct value analysis",       machine: null,   hours: 4 },
                { opId: 40, opName: "Result reporting",        machine: null,   hours: 4 },
            ]
        },
        {
            id: "TO-10010", prodOrderId: "TO-10010",
            itemNumber: "ANA-015", itemName: "ANA & Autoimmune Panel",
            quantity: 20, unitOfMeasure: "samples",
            status: "Released", priority: "High",
            assignedWorker: "W003", assignedMachine: "M006",
            scheduledStart: d(1, 8), scheduledEnd: d(2, 16),
            estimatedHours: 16, actualHours: 0,
            routeOperations: [
                { opId: 10, opName: "Serum separation",       machine: "M005", hours: 2 },
                { opId: 20, opName: "IFA screening",          machine: "M006", hours: 6 },
                { opId: 30, opName: "Reflex autoantibodies",  machine: "M006", hours: 4 },
                { opId: 40, opName: "Pathologist review",     machine: null,   hours: 4 },
            ]
        },
    ];

    // Track changes for "publish" functionality
    let pendingChanges = [];

    // ──────────────────────────────────────────────
    //  SIMULATED NETWORK DELAY
    // ──────────────────────────────────────────────
    function simulateDelay(ms = 300) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ──────────────────────────────────────────────
    //  PUBLIC API — mirrors OData calls
    // ──────────────────────────────────────────────

    /**
     * GET ProductionOrders
     * Real D365: GET /data/ProductionOrders?$filter=ProdStatus eq 'Scheduled' or ProdStatus eq 'Released'
     *            &$expand=RouteOperations
     */
    async function getProductionOrders() {
        await simulateDelay();
        // Return deep copy
        return JSON.parse(JSON.stringify(productionOrders));
    }

    /**
     * GET Workers (WrkCtrTable filtered to type=Person, or HcmWorker)
     */
    async function getWorkers() {
        await simulateDelay(100);
        return JSON.parse(JSON.stringify(workers));
    }

    /**
     * GET Machines (WrkCtrTable filtered to type=Machine)
     */
    async function getMachines() {
        await simulateDelay(100);
        return JSON.parse(JSON.stringify(machines));
    }

    /**
     * PATCH ProductionOrder — reschedule
     * Real D365: PATCH /data/ProductionOrders('<prodOrderId>')
     * Body: { "SchedFromDate": "...", "SchedToDate": "..." }
     */
    async function updateProductionOrder(orderId, updates) {
        await simulateDelay(200);

        const order = productionOrders.find(o => o.id === orderId);
        if (!order) throw new Error(`Order ${orderId} not found`);

        // Apply updates locally
        if (updates.scheduledStart) order.scheduledStart = new Date(updates.scheduledStart);
        if (updates.scheduledEnd)   order.scheduledEnd   = new Date(updates.scheduledEnd);
        if (updates.assignedWorker) order.assignedWorker  = updates.assignedWorker;
        if (updates.assignedMachine) order.assignedMachine = updates.assignedMachine;

        // Record the change
        pendingChanges.push({
            orderId,
            orderName: order.itemName,
            timestamp: new Date(),
            changes: { ...updates }
        });

        return { success: true, order: JSON.parse(JSON.stringify(order)) };
    }

    /**
     * Batch PATCH — publish all pending changes to D365
     * Real D365: POST /data/$batch with changeset
     */
    async function publishAllChanges() {
        await simulateDelay(800);

        // In real implementation, you'd build an OData $batch request:
        // POST https://<env>.operations.dynamics.com/data/$batch
        // Content-Type: multipart/mixed; boundary=batch_xyz
        //
        // Each changeset would contain PATCH requests for modified orders

        const published = [...pendingChanges];
        pendingChanges = [];

        return {
            success: true,
            publishedCount: published.length,
            changes: published,
            message: `Successfully published ${published.length} change(s) to D365`
        };
    }

    /**
     * Get list of unpublished changes
     */
    function getPendingChanges() {
        return [...pendingChanges];
    }

    /**
     * Discard all pending changes and reload from source
     */
    async function discardAllChanges() {
        pendingChanges = [];
        // In real impl, re-fetch from D365
        return { success: true };
    }

    // ──────────────────────────────────────────────
    //  REAL D365 ODATA HELPER (reference implementation)
    // ──────────────────────────────────────────────

    /**
     * Example of how a real OData call to D365 would look.
     * Uncomment and use when connecting to actual D365 environment.
     * 
     * Prerequisites:
     *   - Register an app in Azure AD / Entra ID
     *   - Grant it permissions to Dynamics 365
     *   - Use MSAL.js to acquire tokens
     *
     * async function _realODataGet(entitySet, queryParams) {
     *     const token = await msalInstance.acquireTokenSilent({ scopes: [`${CONFIG.baseUrl}/.default`] });
     *     const url = `${CONFIG.baseUrl}/${entitySet}?${queryParams}`;
     *     const response = await fetch(url, {
     *         headers: {
     *             "Authorization": `Bearer ${token.accessToken}`,
     *             "Accept": "application/json",
     *             "OData-MaxVersion": "4.0",
     *             "OData-Version": "4.0"
     *         }
     *     });
     *     if (!response.ok) throw new Error(`OData GET failed: ${response.status}`);
     *     const data = await response.json();
     *     return data.value;
     * }
     *
     * async function _realODataPatch(entitySet, key, body) {
     *     const token = await msalInstance.acquireTokenSilent({ scopes: [`${CONFIG.baseUrl}/.default`] });
     *     const url = `${CONFIG.baseUrl}/${entitySet}('${key}')`;
     *     const response = await fetch(url, {
     *         method: "PATCH",
     *         headers: {
     *             "Authorization": `Bearer ${token.accessToken}`,
     *             "Content-Type": "application/json",
     *             "OData-Version": "4.0",
     *             "If-Match": "*"
     *         },
     *         body: JSON.stringify(body)
     *     });
     *     if (!response.ok) throw new Error(`OData PATCH failed: ${response.status}`);
     *     return { success: true };
     * }
     */

    return {
        getProductionOrders,
        getWorkers,
        getMachines,
        updateProductionOrder,
        publishAllChanges,
        getPendingChanges,
        discardAllChanges,
        CONFIG
    };

})();
