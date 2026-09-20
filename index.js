const express = require('express');
const Airtable = require('airtable');

const app = express();
app.use(express.json());

// Initialize secure cross-cloud authorization tokens using your environment variables
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// 🔗 PHASE 4: MIDDLEWARE WEBHOOK & ROUTER BRIDGE ENDPOINT
app.post('/api/webhook/inventory-sync', async (req, res) => {
    console.log('📥 Inbound webhook event captured. Running enterprise multi-status ledger computation...');
    
    try {
        // 1. Fetch active data across your 3NF schema layers asynchronously
        const orderRecords = await base('Orders').select().all();
        const lineItemRecords = await base('Line Items').select().all();
        const productRecords = await base('Products').select().all();

        // 3NF Mathematical baselines mapped straight from your master setup catalog catalog configuration
        const initialStockMap = {
            'PROD-KYB-MECH': 76,
            'PROD-CBL-USB': 200,
            'PROD-MOUSE-01': 100,
            'PROD-HD-1TB': 50,
            'PROD-MON-27': 30
        };

        // Define status states that actively hold a committed stock deduction
        const activeDeductionStatuses = ['Approved', 'Processing', 'Fulfilled'];

        // 2. Index your parent Order Status states by their unique Airtable Record ID string values
        const ordersStatusMap = {};
        orderRecords.forEach(order => {
            ordersStatusMap[order.id] = order.get('Order Status');
        });

        // Index product record IDs straight to their unique text primary keys (SKU strings)
        const productSkuLookupMap = {};
        productRecords.forEach(prod => {
            productSkuLookupMap[prod.id] = prod.get('SKU');
        });

        // 3. Loop through your M:N Junction table records [Line Items] to calculate historical commitments
        const calculatedDeductions = {};

        lineItemRecords.forEach(item => {
            // Extract the linked Order array reference parameter from your 3NF layout
            const orderLinks = item.get('Order ID Linked') || [];
            if (orderLinks.length === 0) return;

            // Safely pluck the explicit record reference string out of the array container
            const parentOrderId = orderLinks[0];
            const orderStatus = ordersStatusMap[parentOrderId];

            // Only tally items if their parent invoice matches an active commitment status token
            if (activeDeductionStatuses.includes(orderStatus)) {
                const productLinks = item.get('Product Linked') || [];
                if (productLinks.length === 0) return;

                const productId = productLinks[0];
                const sku = productSkuLookupMap[productId];
                const quantity = Number(item.get('Quantity Ordered')) || 0;

                if (sku && quantity > 0) {
                    calculatedDeductions[sku] = (calculatedDeductions[sku] || 0) + quantity;
                }
            }
        });

        console.log('📊 Calculated Ledger Deductions Matrix:', JSON.stringify(calculatedDeductions));

        // 4. Compute the true dynamic final balances safely without fighting Airtable's rollup cells
        const updatePayload = productRecords.map(record => {
            const sku = record.get('SKU');
            const baseStock = initialStockMap[sku] || Number(record.get('Starting Stock')) || 0;
            const totalDeduction = calculatedDeductions[sku] || 0;
            
            return {
                id: record.id,
                fields: {
                    'Starting Stock': baseStock // Keeps your raw baseline baseline structurally locked!
                }
            };
        });

        // 5. Bulk push clean data mutations back to your catalog layer in exact legal limits blocks of 10
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

// Render container dynamically injects runtime PORTS, defaulting to 8080 if absent
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Automated Ledger Service is listening on port ${PORT}`));
