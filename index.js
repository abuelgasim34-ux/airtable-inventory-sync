const express = require('express');
const Airtable = require('airtable');

const app = express();
app.use(express.json());

// Initialize secure cross-cloud authorization tokens using environment variables
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// 🔗 PRODUCTION ENDPOINT ROUTE
app.post('/api/webhook/inventory-sync', async (req, res) => {
    console.log('📥 Inbound webhook event captured. Running enterprise multi-status ledger computation...');
    
    try {
        // 1. Fetch data across related entities to construct the cross-table link matrix
        const orderRecords = await base('Orders').select().all();
        const lineItemRecords = await base('Line Items').select().all();
        const productRecords = await base('Products').select().all();

        // Hardcoded mathematical baselines from your initial warehouse setup catalog configuration
        const initialStockMap = {
            'PROD-KYB-MECH': 76,
            'PROD-CBL-USB': 200,
            'PROD-MOUSE-01': 100,
            'PROD-HD-1TB': 50,
            'PROD-MON-27': 30
        };

        // Status states that actively hold a committed stock deduction
        const activeDeductionStatuses = ['Approved', 'Processing', 'Fulfilled'];

        // 2. Index active orders by their record ID to map statuses instantly
        const ordersStatusMap = {};
        orderRecords.forEach(order => {
            ordersStatusMap[order.id] = order.get('Order Status');
        });

        // 3. Compute total historic deductions based strictly on the status of the parent Order
        const calculatedDeductions = {};

        lineItemRecords.forEach(item => {
            // Extract the linked order pointer array
            const linkedOrders = item.get('Orders') || item.get('Order') || [];
            if (linkedOrders.length === 0) return; // Skip if line item is not linked to any order

            //🚀 HOTFIX: Extract the literal text ID string out of the Airtable link array container 
            const parentOrderId = linkedOrders && linkedOrders.length > 0 ? linkedOrders[0] : null;
            const orderStatus = parentOrderId ? ordersStatusMap[parentOrderId] : null;

            // Only process calculations if the parent order is Approved, Processing, or Fulfilled
            if (activeDeductionStatuses.includes(orderStatus)) {
                const skuArray = item.get('Product Linked');
                const sku = skuArray && skuArray.length > 0 ? skuArray[0] : null; // Safe extraction of linked record string
                const quantity = Number(item.get('Quantity Ordered')) || 0;

                if (sku && quantity > 0) {
                    calculatedDeductions[sku] = (calculatedDeductions[sku] || 0) + quantity;
                }
            }
        });

        // 4. Compute the true dynamic final balance for every catalog row layout
        const updatePayload = productRecords.map(record => {
            const sku = record.get('SKU');
            const baseStock = initialStockMap[sku] || Number(record.get('Starting Stock')) || 0;
            const totalDeduction = calculatedDeductions[sku] || 0;
            
            return {
                id: record.id,
                fields: {
                    'Starting Stock': Math.max(0, baseStock - totalDeduction)
                }
            };
        });

        // 5. Bulk push the clean balance updates back to Airtable in blocks of 10 records max (Airtable API safety limit)
        if (updatePayload.length > 0) {
            for (let i = 0; i < updatePayload.length; i += 10) {
                const chunk = updatePayload.slice(i, i + 10);
                await base('Products').update(chunk);
                console.log(`📦 Pushed chunk matrix: Processed items ${i + 1} to ${Math.min(i + 10, updatePayload.length)} successfully.`);
            }
            console.log('✅ Success! Two-way multi-status inventory stock sync completed.');
            return res.status(200).json({ success: true, message: 'Stock levels synced successfully across all operational states.' });
        } else {
            return res.status(200).json({ success: true, message: 'Calculated ledger properties require zero variation.' });
        }

    } catch (error) {
        console.error('❌ Error executing multi-status ledger pipeline:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Automated Ledger Service is listening on port ${PORT}`));
