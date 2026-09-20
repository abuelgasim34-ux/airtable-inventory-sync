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

        // 2. Index active orders by BOTH their record ID and primary visible text name (1, 2, 3)
        const ordersStatusMap = {};
        orderRecords.forEach(order => {
            // Index by internal Airtable Record ID
            ordersStatusMap[order.id] = order.get('Order Status');
            
            // Index by visible Order ID Name (e.g., "1", "3", "4")
            const orderIdName = order.get('Order ID') || order.get('Order Number') || order.get('Name');
            if (orderIdName) {
                ordersStatusMap[String(orderIdName).trim()] = order.get('Order Status');
            }
        });

        // Index product record IDs and SKUs to map them instantly to their respective text SKU strings
        const productSkuLookupMap = {};
        productRecords.forEach(prod => {
            productSkuLookupMap[prod.id] = prod.get('SKU'); 
            
            const customSku = prod.get('SKU');
            if (customSku) {
                productSkuLookupMap[String(customSku).trim()] = customSku;
            }
        });

        // 3. Compute total historic deductions based strictly on the status of the parent Order
        const calculatedDeductions = {};

        lineItemRecords.forEach(item => {
            // Adaptive Fallback Array: Tries common naming variations for your link column header
            const linkedOrders = item.get('Orders') || item.get('Order') || item.get('Order Number') || item.get('Order Link') || [];
            if (!linkedOrders || (Array.isArray(linkedOrders) && linkedOrders.length === 0)) return;

            // 🚀 ROBUST EXTRACTOR: Reach inside the Airtable API's link structure to pull the string reference
            let parentOrderId = null;
            if (Array.isArray(linkedOrders) && linkedOrders.length > 0) {
                const firstLink = linkedOrders[0];
                parentOrderId = typeof firstLink === 'object' ? (firstLink.id || firstLink.name) : firstLink;
            } else {
                parentOrderId = typeof linkedOrders === 'object' ? (linkedOrders.id || linkedOrders.name) : linkedOrders;
            }
            
            if (parentOrderId) parentOrderId = String(parentOrderId).trim();
            
            // Cross-reference using our dual-indexed status map
            const orderStatus = parentOrderId ? ordersStatusMap[parentOrderId] : null;

            // Only process calculations if the parent order matches an active deduction status
            if (orderStatus && activeDeductionStatuses.includes(orderStatus)) {
                const linkedProductIds = item.get('Product Linked') || item.get('SKU Link') || item.get('Product') || [];
                if (!linkedProductIds || (Array.isArray(linkedProductIds) && linkedProductIds.length === 0)) return;

                // 🚀 ROBUST EXTRACTOR: Reach inside the Airtable API's product link array to pull the string identifier
                let productId = null;
                if (Array.isArray(linkedProductIds) && linkedProductIds.length > 0) {
                    const firstProdLink = linkedProductIds[0];
                    productId = typeof firstProdLink === 'object' ? (firstProdLink.id || firstProdLink.name) : firstProdLink;
                } else {
                    productId = typeof linkedProductIds === 'object' ? (linkedProductIds.id || linkedProductIds.name) : linkedProductIds;
                }

                if (productId) productId = String(productId).trim();
                
                // Convert the product reference into your text SKU matching identifier
                const sku = productId ? (productSkuLookupMap[productId] || productId) : null; 
                const quantity = Number(item.get('Quantity Ordered')) || Number(item.get('Quantity')) || 0;

                if (sku && quantity > 0) {
                    calculatedDeductions[sku] = (calculatedDeductions[sku] || 0) + quantity;
                }
            }
        });

        console.log('📊 Calculated Ledger Deductions Matrix:', JSON.stringify(calculatedDeductions));

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
