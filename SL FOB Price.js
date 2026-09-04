/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 */
define(["N/record", "N/redirect", "N/runtime", "N/ui/serverWidget", "../../Lib/Libraries Utility", "../../Lib/Libraries Code 2.0.220622"], function (record, redirect, runtime, ui, libUtility, libCode) {
    // "use strict";
    // Object.defineProperty(exports, "__esModule", { value: true });
    /*
     * @author      [27/02/2025] Tanuwong <tanuwong@teibto.com>
     * @version     1.0
     * @requires - Create With TypeScript
     * Name :
     * ID :
     * @changes 1 Create Script
     * ref : Double A_FOBPrice_Calculation_Specification
     * aHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvMUhXQThuMDVVVGxPTE1pelVUSDMxWmI1VW8td3o5TGlvUV9jMHBISmpMckkvZWRpdD9naWQ9MzA5MDI4NzAyI2dpZD0zMDkwMjg3MDI=
    */
    const CS_SCRIPTID_PATH = './SL FOB Price CS.js';
    const MULTISELECT_DELIMITER = /\u0005/;
    const STEP_PAGE = {
        PAGE1_FILTER: 'PAGE1_FILTER',
        PAGE_2_CALCULATION: 'PAGE_2_CALCULATION',
        PAGE_3_UPDATE_DATA: 'PAGE_3_UPDATE_DATA',
        // CREATE_SHIPPING_ADVICE: 'CREATE_SHIPPING_ADVICE',
        // CREATE_LOG: 'CREATE_LOG',
        // VIEW_LOG: 'VIEW_LOG',
        // CREATE_SESSION_LOG: 'CREATE_SESSION_LOG',
        TRACE: 'TRACE',
    };
    const PRICE_RATE_TYPE = {
        FREIGHT: '1',
        INSURANCE: '2',
        DESTINATION_PORT: '3', // Destination port charge + Custom clearance // DESTINATION_PORT
        TRUCK: '4',
        DUTY: '5',
        SHUTTLE_PORT: '6',
        WAREHOUSE: '9',
    };
    /**
     *
     * Mapping fields for Update SO
     *
     */
    const PRICE_RATE_FIELDS = {
        '1': 'custbody_fob_freight_rate',
        '2': 'custbody_fob_insurance_rate',
        '3': 'custbody_fob_dthc_rate',
        '4': 'custbody_fob_truck_rate',
        '5': 'custbody_fob_duty_rate',
        '6': 'custbody_fob_other_oversea',
    };
    const TRACE_USER = 189;
    function onRequest(context) {
        // ==================== Define Default Variable
        let request = context.request;
        let response = context.response;
        let params = request.parameters;
        let step = params.step || '';
        // let responseStatus: responseStatus;
        // ============================================
        let dateStart = new Date();
        log.debug('Start step :' + step, dateStart.toISOString());
        switch (step) {
            case '':
            case STEP_PAGE.PAGE1_FILTER:
            case STEP_PAGE.PAGE_2_CALCULATION:
                Page1_FOB_Price_Calculation(context, params);
                break;
            case STEP_PAGE.PAGE_3_UPDATE_DATA:
                Page2_FOB_Price_Update_Data(context, params);
                break;
            default:
                log.error({ title: '404 Page Not Found', details: { step } });
                response.write(JSON.stringify({ ERROR: '404 Page Not Found', step }, null, 5));
        }
        log.debug('End step :' + step, 'Remaining Usage : ' + runtime.getCurrentScript().getRemainingUsage() + ', ' + libCode.stopWatch(dateStart));
    }
    /*========================================= Use Case ==============================*/
    function Page1_FOB_Price_Calculation(context, params) {
        const { rectype, recid = '', step = '', trace = '' } = params;
        // เช็ค Admin หรือ Trace User ก่อนแสดงปุ่ม Trace
        let currentUserId = runtime.getCurrentUser().id;
        let currentUserRole = runtime.getCurrentUser().role;
        let isAdmin = (currentUserRole === 3); // Role 3 = Administrator
        let isTraceUser = (currentUserId === TRACE_USER);
        if (!recid) {
            throw 'Please enter value(s) for: Document Number';
        }
        // กรองเฉพาะ key ที่ขึ้นต้นด้วย "custpage_"
        let paramsValueObj = getFieldParams(params);
        let cRecord = record.load({ type: record.Type.SALES_ORDER, id: recid, isDynamic: false });
        let shipDate = cRecord.getValue({ fieldId: 'shipdate' }) || null;
        if (!shipDate) {
            throw 'Please enter value(s) for: ETD Date';
        }
        let fob_price_setup_id = '';
        let currentDate = new Date();
        let thisDateStr = libUtility.DateFormat(libUtility.getThaiDate(currentDate));
        let etdDateStr = libUtility.DateFormat(libUtility.getThaiDate(shipDate));
        let transDate = libUtility.DateFormat(cRecord.getValue({ fieldId: 'trandate' }));
        let FOB_Price_SO = {
            custpage_document_number: null,
            custpage_customer: '',
            custpage_currency: '',
            custpage_currency_text: '',
            custpage_country: '',
            custpage_region: '',
            custpage_port: '',
            custpage_incoterm: '',
            custpage_sales_channel: '',
            custpage_net_amount: 0,
            custpage_date_start: transDate,
            custpage_etd_date: null,
            custpage_country_zone: null,
        };
        let FOB_Price_Params = {
            // No.of Container
            NO_OF_CONTAINER: 0,
            // Net Weight
            NET_WEIGHT: 0,
            // Exc.Rate(USD)
            EXC_RATE_USD: 0,
            // Exc.Rate(3TH Bank)
            EXC_RATE_3TH_BANK: 0,
            // Exc.Rate USD to SAR
            EXC_RATE_USD_TO_CURRENT: 0,
            EXC_RATE_CURRENT_TO_USD: 0,
            // Exc.Rate(BOT)
            EXC_RATE_BOT: 0,
            CURRENCY_DIGIT: 0,
        };
        let FOB_Price_Rate = {};
        FOB_Price_SO.custpage_document_number = cRecord.id;
        FOB_Price_SO.custpage_customer = cRecord.getValue({ fieldId: 'entity' }) || '';
        FOB_Price_SO.custpage_currency = cRecord.getValue({ fieldId: 'currency' }) || '';
        FOB_Price_SO.custpage_currency_text = cRecord.getText({ fieldId: 'currency' }) || '';
        // FOB_Price_SO.custpage_country = cRecord.getValue({ fieldId: 'cseg_cust_country' }) as string || '';
        // change cseg_cust_country to custbody_ship_to_country
        FOB_Price_SO.custpage_country = cRecord.getValue({ fieldId: 'custbody_ship_to_country' }) || '';
        FOB_Price_SO.custpage_port = cRecord.getValue({ fieldId: 'custbody_port' }) || ''; // custbody_inv_final_destination
        FOB_Price_SO.custpage_incoterm = cRecord.getValue({ fieldId: 'custbody_incoterms' }) || '';
        FOB_Price_SO.custpage_net_amount = cRecord.getValue({ fieldId: 'total' });
        FOB_Price_SO.custpage_etd_date = shipDate;
        FOB_Price_SO.custpage_country_zone = cRecord.getValue({ fieldId: 'custbody_countryzone' });
        FOB_Price_SO.custpage_sales_channel = cRecord.getValue({ fieldId: 'cseg_sale_channel' });
        FOB_Price_Params.NO_OF_CONTAINER = FOBPriceModule.getQtyContainers(cRecord);
        FOB_Price_Params.CURRENCY_DIGIT = FOB_Price_SO.custpage_currency == '9' ? 0 : 8; // KRW is 0 Decimal, Other Currency is 8 Decimal
        const FIX_DECIMAL = FOB_Price_Params.CURRENCY_DIGIT;
        /**
         *
         * FOB Price Rate จาก User ปรับที่หน้าจอ
         * เเละ Defalut จาก SO
         *
         */
        let FobPriceRateObj = {};
        if (step === STEP_PAGE.PAGE_2_CALCULATION) {
            FobPriceRateObj = libUtility.jsonParse(paramsValueObj.custpage_fob_price_rate, {});
        }
        else {
            // ยังไม่กดปุ่ม calculate
            // Defalut จาก SO
            Object.entries(PRICE_RATE_FIELDS).forEach(function (item) {
                const [setup_type, field_id_so] = item;
                if (!!setup_type && !!field_id_so) {
                    let value = cRecord.getValue({ fieldId: field_id_so });
                    if (value) {
                        FobPriceRateObj[setup_type] = {
                            rate_setup_rate: value
                        };
                    }
                }
            });
        }
        /**
         * Create Form And Body Fields
         */
        let form = FOBPriceModule.createUIFormAndFields();
        let sublistFobPriceRate = FOBPriceModule.createSublistFobPriceRate(form, FOB_Price_SO);
        /**
         * Create Sublist Sale Order Details
         */
        let sublistSalesOrder = FOBPriceModule.createSublistFobDetail(form, FOB_Price_SO);
        let ssSalesOrderRow = FOBPriceModule.getFobPriceLineItem(recid);
        let excRateObj = FOBPriceModule.AvgExchangeRate(etdDateStr);
        let resultBotExcRateObj = FOBPriceModule.BotExchangeRate(etdDateStr, FOB_Price_SO.custpage_currency);
        /**
         * Exc.Rate Doc.Currency(3TH Bank)
         */
        let exc_rate_3th = excRateObj[FOB_Price_SO.custpage_currency]?.buying || 0;
        let exc_rate_usd = excRateObj['2']?.buying || 0; // Currency USD
        let exc_rate_bot = resultBotExcRateObj[FOB_Price_SO.custpage_currency]?.buying || 0;
        let current_total_amount = 0;
        let sumtotal_amount = 0;
        let totalItemAmount = 0; // is not Subtotal, Discount
        let discount_amount = 0;
        let total_qty_ton = 0;
        let total_net_amount_current = 0;
        ssSalesOrderRow.forEach(function (row, i) {
            let { item_type, amount_foreign_currency, quantity, custcol_net_weight, units } = row;
            // log.debug({
            //     title: 'Row Data',
            //     details: {
            //         item_type,
            //         amount_foreign_currency,
            //         quantity,
            //         custcol_net_weight,
            //         units
            //     }        
            // });
            let qty_ton = 0;
            if (['MT'].includes(units)) {
                qty_ton = (quantity / 1000) || 0;
            }
            else {
                // (custcol_net_weight / 1000) 
                qty_ton = (custcol_net_weight / 1000) || 0;
            }
            total_net_amount_current = libCode.addNumber(amount_foreign_currency, total_net_amount_current);
            if (!!qty_ton) {
                total_qty_ton = libCode.addNumber(total_qty_ton, Number(libCode.toFixed2(qty_ton, 3)));
            }
            if (item_type === 'Subtotal') {
                sumtotal_amount = libCode.addNumber(amount_foreign_currency, sumtotal_amount);
            }
            if (item_type === 'Discount') {
                discount_amount = libCode.addNumber(amount_foreign_currency, discount_amount);
            }
            // is not Subtotal, Discount
            if (['Subtotal', 'Discount'].includes(item_type) === false) {
                totalItemAmount = libCode.addNumber(amount_foreign_currency, totalItemAmount);
            }
        });
        // Sumtotal is Item Only
        // is not Subtotal, Discount
        if (sumtotal_amount == 0) {
            sumtotal_amount = totalItemAmount;
        }
        FOB_Price_Params.NET_WEIGHT = total_qty_ton;
        FOB_Price_Params.EXC_RATE_USD = exc_rate_usd; // // Exc.Rate(USD 3TH Bank)
        FOB_Price_Params.EXC_RATE_3TH_BANK = exc_rate_3th; // Exc.Rate Doc.Currency(3TH Bank)
        FOB_Price_Params.EXC_RATE_USD_TO_CURRENT = (exc_rate_usd / exc_rate_3th) || 0; // Exc.Rate USD to Doc.Currency
        FOB_Price_Params.EXC_RATE_CURRENT_TO_USD = (exc_rate_3th / exc_rate_usd) || 0; // Exc.Rate Doc.Currency to USD
        FOB_Price_Params.EXC_RATE_BOT = exc_rate_bot;
        let resultsFobPriceSetupArr = FOBPriceModule.getFOBPriceSetup(FOB_Price_SO);
        let resultsFOBPriceRateType = FOBPriceModule.loadFOBPriceRateType();
        if (resultsFobPriceSetupArr.length > 0) {
            resultsFobPriceSetupArr.forEach(function (row, index) {
                let { rate_setup_percent, enable_editing, rate_setup_type } = row;
                // Adjust FOB Price Rate จาก User ปรับที่หน้าจอ
                if (FobPriceRateObj[rate_setup_type] !== undefined) {
                    let { rate_setup_currency, rate_setup_rate } = FobPriceRateObj[rate_setup_type];
                    if (!!rate_setup_currency) {
                        row.rate_setup_currency = rate_setup_currency;
                        // Value is Percentage
                        if (rate_setup_percent == false) {
                            let exchange_rate_currency = 0;
                            if (rate_setup_currency == '1') {
                                exchange_rate_currency = (1 / exc_rate_3th);
                            }
                            else {
                                let exRate = excRateObj[rate_setup_currency];
                                if (exRate) {
                                    let buying = exRate.buying || 0;
                                    exchange_rate_currency = (buying / exc_rate_3th);
                                }
                            }
                            row.exchange_rate_currency = exchange_rate_currency;
                            FobPriceRateObj[rate_setup_type].exchange_rate_currency = exchange_rate_currency;
                        }
                    }
                    row.rate_setup_rate = Number(rate_setup_rate);
                }
                else {
                    if (!!row.rate_setup_currency) {
                        // row.rate_setup_currency = rate_setup_currency;
                        // Value is Percentage
                        if (rate_setup_percent == false) {
                            let exchange_rate_currency = 0;
                            if (row.rate_setup_currency == '1') {
                                exchange_rate_currency = (1 / exc_rate_3th);
                            }
                            else {
                                let exRate = excRateObj[row.rate_setup_currency];
                                if (exRate) {
                                    let buying = exRate.buying || 0;
                                    exchange_rate_currency = (buying / exc_rate_3th);
                                }
                            }
                            row.exchange_rate_currency = exchange_rate_currency;
                        }
                    }
                }
                // FOB Price Rate Type จาก User ปรับที่หน้าจอ
                // {Minimum Amount},{Standard Rate}
                if (resultsFOBPriceRateType[row.rate_setup_type] !== undefined) {
                    let { minamount = 0, stdrate = 0 } = resultsFOBPriceRateType[row.rate_setup_type];
                    row.minamount = minamount;
                    row.stdrate = stdrate;
                }
                fob_price_setup_id = row.setup_id;
                if (FOB_Price_Rate[rate_setup_type] === undefined) {
                    FOB_Price_Rate[rate_setup_type] = row;
                }
                // rate_type
                if (rate_setup_type) {
                    sublistFobPriceRate.setSublistValue({ line: index, id: 'rate_type', value: rate_setup_type });
                }
                // rate
                if (row.rate_setup_rate || row.rate_setup_rate === 0) {
                    sublistFobPriceRate.setSublistValue({ line: index, id: 'rate', value: String(row.rate_setup_rate) });
                }
                // currency
                if (!!row.rate_setup_currency) {
                    sublistFobPriceRate.setSublistValue({ line: index, id: 'currency', value: row.rate_setup_currency });
                }
                // value_is_percentage
                if (row.rate_setup_percent === true) {
                    sublistFobPriceRate.setSublistValue({ line: index, id: 'value_is_percentage', value: 'T' });
                }
                if (enable_editing === true) {
                    sublistFobPriceRate.setSublistValue({ line: index, id: 'enable_editing', value: 'T' });
                }
                // Exchange Rate (KRW)
                if (row.exchange_rate_currency) {
                    sublistFobPriceRate.setSublistValue({ line: index, id: 'exchange_rate_currency', value: libCode.toFixed2(row.exchange_rate_currency, 2) });
                }
            });
        }
        log.debug({
            title: 'FOB_Price_Params',
            details: {
                FOB_Price_Params
            }
        });
        let subtotal_line = {
            item: '',
            item_type: '',
            lineuniquekey: '',
            amount: sumtotal_amount,
            net_amount: 0,
            amount_thb: 0,
            freight_amt: 0,
            dthc_amt: 0,
            truck_amt: 0,
            other_oversea_amt: 0,
            warehouse_amt: 0,
            insurance_amt: 0,
            duty_amt: 0,
            fob_net_amountorg_currency: 0,
            fob_net_amt_3th_bank_thb: 0,
            bot_rate: 0,
            fob_net_amt_bot_rate_thb: 0,
        };
        let discount_line = {
            item: '',
            item_type: '',
            lineuniquekey: '',
            amount: discount_amount,
            net_amount: 0,
            amount_thb: 0,
            freight_amt: 0,
            dthc_amt: 0,
            truck_amt: 0,
            other_oversea_amt: 0,
            warehouse_amt: 0,
            insurance_amt: 0,
            duty_amt: 0,
            fob_net_amountorg_currency: 0,
            fob_net_amt_3th_bank_thb: 0,
            bot_rate: 0,
            fob_net_amt_bot_rate_thb: 0,
        };
        let indexLine = 0;
        ssSalesOrderRow.forEach(function (row, i) {
            let { tranid, item, displayname, unit_price_ddp, qty_in_transaction_unit_ton, units, quantity, stockunit, amount, amount_foreign_currency, line, lineuniquekey, item_type, ignore_container_fobprice, custcol_net_weight } = row;
            // let qty_ton = (quantity / 1000) || 0;
            let qty_ton = 0;
            if (['MT'].includes(units)) {
                qty_ton = (quantity / 1000) || 0;
            }
            else {
                // (custcol_net_weight / 1000) 
                qty_ton = (custcol_net_weight / 1000) || 0;
            }
            let amount_current = amount_foreign_currency; // (qty_in_transaction_unit_ton * unit_price_ddp) || 0;
            // (Amount/ Subtotal ) * Discount
            let subtotal_discount = ((amount_foreign_currency / sumtotal_amount) * discount_amount) || 0;
            let net_amount = (amount_foreign_currency - Math.abs(subtotal_discount)) || 0;
            let net_amount_current = net_amount;
            let net_amount_thb = (exc_rate_3th * net_amount) || 0;
            if (item_type === 'Subtotal') {
                subtotal_line.item = item;
                subtotal_line.item_type = item_type;
                subtotal_line.lineuniquekey = lineuniquekey;
            }
            if (item_type === 'Discount') {
                discount_line.item = item;
                discount_line.item_type = item_type;
                discount_line.lineuniquekey = lineuniquekey;
            }
            // Add Line ที่ไม่ใช่ 'Subtotal','Discount'
            if (['Subtotal', 'Discount'].includes(item_type) === false) {
                const { freight_amt = 0, freight_per_ton = 0, dthc_per_ton = 0, dthc_amt = 0, truck_per_ton = 0, truck_amt = 0, other_oversea_per_ton = 0, other_oversea_amt = 0, insurance_standard_rate = 0, insurance_minimum = 0, insurance_amt = 0, duty_amt = 0, fob_net_amountorg_currency = 0, fob_net_amt_3th_bank_thb = 0, exc_rate_bot = 0, fob_net_amt_bot_rate_thb = 0, warehouse_per_ton, warehouse_amt = 0 } = CalculationFOBPrice({ FOB_Price_Params, FOB_Price_Rate, qty_ton, amount_current, sumtotal_amount, net_amount_current, total_net_amount_current, ignore_container_fobprice });
                let fob_gross_amt = (fob_net_amountorg_currency + subtotal_discount);
                log.debug({
                    title: 'CalculationFOBPrice ' + line,
                    details: {
                        freight_amt,
                        freight_per_ton,
                        dthc_per_ton,
                        dthc_amt,
                        truck_per_ton,
                        truck_amt,
                        other_oversea_per_ton,
                        other_oversea_amt,
                        insurance_standard_rate,
                        insurance_minimum,
                        insurance_amt,
                        duty_amt,
                        fob_net_amountorg_currency,
                        fob_net_amt_3th_bank_thb,
                        exc_rate_bot,
                        fob_net_amt_bot_rate_thb,
                        insurance_standard_rate_2: libCode.toFixed2(insurance_standard_rate || 0, 2)
                    }
                });
                // Sum Total Line
                // subtotal_line.amount = libCode.addNumber(amount, subtotal_line.amount)
                subtotal_line.net_amount = libCode.addNumber(net_amount, subtotal_line.net_amount);
                subtotal_line.amount_thb = libCode.addNumber(net_amount_thb, subtotal_line.amount_thb);
                subtotal_line.freight_amt = libCode.addNumber(freight_amt, subtotal_line.freight_amt);
                subtotal_line.dthc_amt = libCode.addNumber(dthc_amt, subtotal_line.dthc_amt);
                subtotal_line.truck_amt = libCode.addNumber(truck_amt, subtotal_line.truck_amt);
                subtotal_line.other_oversea_amt = libCode.addNumber(other_oversea_amt, subtotal_line.other_oversea_amt);
                subtotal_line.warehouse_amt = libCode.addNumber(warehouse_amt, subtotal_line.warehouse_amt);
                subtotal_line.insurance_amt = libCode.addNumber(insurance_amt, subtotal_line.insurance_amt);
                subtotal_line.duty_amt = libCode.addNumber(duty_amt, subtotal_line.duty_amt);
                subtotal_line.fob_net_amountorg_currency = libCode.addNumber(fob_net_amountorg_currency, subtotal_line.fob_net_amountorg_currency);
                subtotal_line.fob_net_amt_3th_bank_thb = libCode.addNumber(fob_net_amt_3th_bank_thb, subtotal_line.fob_net_amt_3th_bank_thb);
                subtotal_line.fob_net_amt_bot_rate_thb = libCode.addNumber(fob_net_amt_bot_rate_thb, subtotal_line.fob_net_amt_bot_rate_thb);
                sublistSalesOrder.setSublistValue({ line: indexLine, id: 'item', value: item });
                sublistSalesOrder.setSublistValue({ line: indexLine, id: 'item_type', value: item_type });
                sublistSalesOrder.setSublistValue({ line: indexLine, id: 'lineuniquekey', value: lineuniquekey });
                if (unit_price_ddp) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'unit_price_ddp', value: roundTo(unit_price_ddp, 2).toString() });
                }
                if (qty_in_transaction_unit_ton) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'qty_in_transaction_unit_ton', value: String(qty_in_transaction_unit_ton) });
                }
                if (qty_in_transaction_unit_ton) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'unit', value: units });
                }
                if (qty_ton) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'qty_ton', value: String(qty_ton) });
                }
                // Amount (USD)
                if (amount_foreign_currency) {
                    current_total_amount = libCode.addNumber(roundTo(amount_foreign_currency, 2), current_total_amount);
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'amount', value: roundTo(amount_foreign_currency, FIX_DECIMAL).toString() });
                }
                if (exc_rate_3th) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'excrate_3th_bank', value: String(exc_rate_3th) });
                }
                // Subtotal Discount
                if (subtotal_discount) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'subtotal_discount', value: roundTo(subtotal_discount, FIX_DECIMAL).toString() });
                }
                // Net Amount
                if (net_amount) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'net_amount', value: roundTo(net_amount, FIX_DECIMAL).toString() });
                }
                // Amount (THB)
                if (net_amount_thb) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'amount_thb', value: roundTo(net_amount_thb, FIX_DECIMAL).toString() });
                }
                // Freight (Per Ton)
                if (freight_per_ton) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'freight_per_ton', value: String(freight_per_ton) });
                }
                // Freight (Amt)
                if (freight_amt) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'freight_amt', value: roundTo(freight_amt, FIX_DECIMAL).toString() });
                }
                // DTHC (Per Ton)
                if (dthc_per_ton) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'dthc_per_ton', value: String(dthc_per_ton) });
                }
                // DTHC (Amt)
                // dthc_amt
                if (dthc_amt) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'dthc_amt', value: roundTo(dthc_amt, FIX_DECIMAL).toString() });
                }
                // Truck (Per Ton)
                if (truck_per_ton) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'truck_per_ton', value: String(truck_per_ton) });
                }
                // Truck (Amt)
                if (truck_amt) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'truck_amt', value: roundTo(truck_amt, FIX_DECIMAL).toString() });
                }
                // Other oversea (Per Ton)
                if (other_oversea_per_ton) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'other_oversea_per_ton', value: String(other_oversea_per_ton) });
                }
                // Other oversea (Amt)
                if (other_oversea_amt) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'other_oversea_amt', value: roundTo(other_oversea_amt, FIX_DECIMAL).toString() });
                }
                // Warehouse Per Ton
                if (warehouse_per_ton) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'warehouse_per_ton', value: String(warehouse_per_ton) });
                }
                // Warehouse Amt
                if (warehouse_amt) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'warehouse_amt', value: roundTo(warehouse_amt, FIX_DECIMAL).toString() });
                }
                // Insurance (Standard Rate%)
                if (insurance_standard_rate) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'insurance_standard_rate', value: roundTo(insurance_standard_rate, FIX_DECIMAL).toString() });
                }
                // Insurance (minimum)
                if (insurance_minimum) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'insurance_minimum', value: roundTo(insurance_minimum, FIX_DECIMAL).toString() });
                }
                // Insurance (Amt)
                if (insurance_amt) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'insurance_amt', value: roundTo(insurance_amt, FIX_DECIMAL).toString() });
                }
                // Duty (Amt)
                if (duty_amt) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'duty_amt', value: roundTo(duty_amt, FIX_DECIMAL).toString() });
                }
                // FOB Net Amount(Org. currency)
                if (fob_net_amountorg_currency) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'fob_net_amountorg_currency', value: roundTo(fob_net_amountorg_currency, FIX_DECIMAL).toString() });
                }
                // FOB Net Amt. 3TH Bank (THB)
                if (fob_net_amt_3th_bank_thb) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'fob_net_amt_3th_bank_thb', value: roundTo(fob_net_amt_3th_bank_thb, FIX_DECIMAL).toString() });
                }
                // BOT rate
                if (exc_rate_bot) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'bot_rate', value: exc_rate_bot.toString() });
                }
                // FOB Net Amt. BOT Rate (THB)
                if (fob_net_amt_bot_rate_thb) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'fob_net_amt_bot_rate_thb', value: roundTo(fob_net_amt_bot_rate_thb, FIX_DECIMAL).toString() });
                }
                // fob_gross_amt
                if (fob_gross_amt) {
                    sublistSalesOrder.setSublistValue({ line: indexLine, id: 'fob_gross_amt', value: roundTo(fob_gross_amt, FIX_DECIMAL).toString() });
                }
                indexLine++;
            }
        });
        if (!!subtotal_line?.item) {
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'item', value: subtotal_line.item });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'item_type', value: subtotal_line.item_type });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'lineuniquekey', value: subtotal_line.lineuniquekey });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'amount', value: roundTo(subtotal_line.amount, FIX_DECIMAL).toString() });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'net_amount', value: roundTo(subtotal_line.net_amount, FIX_DECIMAL).toString() });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'amount_thb', value: roundTo(subtotal_line.amount_thb, FIX_DECIMAL).toString() });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'freight_amt', value: roundTo(subtotal_line.freight_amt, FIX_DECIMAL).toString() });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'dthc_amt', value: roundTo(subtotal_line.dthc_amt, FIX_DECIMAL).toString() });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'truck_amt', value: roundTo(subtotal_line.truck_amt, FIX_DECIMAL).toString() });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'other_oversea_amt', value: roundTo(subtotal_line.other_oversea_amt, FIX_DECIMAL).toString() });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'insurance_amt', value: roundTo(subtotal_line.insurance_amt, FIX_DECIMAL).toString() });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'duty_amt', value: roundTo(subtotal_line.duty_amt, FIX_DECIMAL).toString() });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'fob_net_amountorg_currency', value: roundTo(subtotal_line.fob_net_amountorg_currency, FIX_DECIMAL).toString() });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'fob_net_amt_3th_bank_thb', value: roundTo(subtotal_line.fob_net_amt_3th_bank_thb, FIX_DECIMAL).toString() });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'fob_net_amt_bot_rate_thb', value: roundTo(subtotal_line.fob_net_amt_bot_rate_thb, FIX_DECIMAL).toString() });
            indexLine++;
        }
        if (!!discount_line?.item) {
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'item', value: discount_line.item });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'item_type', value: discount_line.item_type });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'lineuniquekey', value: discount_line.lineuniquekey });
            sublistSalesOrder.setSublistValue({ line: indexLine, id: 'amount', value: roundTo(discount_line.amount, FIX_DECIMAL).toString() });
            // sublistSalesOrder.setSublistValue({ line: indexLine, id: 'net_amount', value: libCode.toFixed2(subtotal_line.net_amount, FIX_DECIMAL) });
            // sublistSalesOrder.setSublistValue({ line: indexLine, id: 'amount_thb', value: libCode.toFixed2(subtotal_line.amount_thb, FIX_DECIMAL) });
            indexLine++;
        }
        log.debug({ title: 'FOB_Price_SO', details: FOB_Price_SO });
        log.debug({ title: 'FOB_Price_Rate', details: FOB_Price_Rate });
        if (resultsFobPriceSetupArr.length > 0) {
            if (step === STEP_PAGE.PAGE_2_CALCULATION) {
                form.addSubmitButton({ label: 'Submit' });
            }
            form.addButton({ label: 'Calculation', id: 'btn_calculation', functionName: 'Calculation()' });
        }
        if (isAdmin) {
            form.addButton({ label: 'Trace', id: 'btn_trace', functionName: `goToPage('${STEP_PAGE.TRACE}')` });
        }
        let logMessage = '<pre style="position: absolute; z-index: 999999999; right: 11px; top: 70px; height: 300px; overflow: scroll; background-color: #fdfdfd;">' + JSON.stringify({ FOB_Price_Params, FobPriceRateObj, FOB_PRICE_SETUP_ID: fob_price_setup_id }, null, 1) + '</pre>';
        form.clientScriptModulePath = CS_SCRIPTID_PATH;
        // form.addPageInitMessage({ type: message.Type.WARNING, message: 'System Process....' });
        form.updateDefaultValues({
            step: STEP_PAGE.PAGE_3_UPDATE_DATA,
            step_current: STEP_PAGE.PAGE1_FILTER,
            script_id: runtime.getCurrentScript().id,
            script_deploy_id: runtime.getCurrentScript().deploymentId,
            custpage_inprogress_bar: libUtility.getLoading('System Process....'),
            custpage_trace: trace,
            ...FOB_Price_SO,
            custpage_fob_price_params: (trace ? logMessage : ''),
            custpage_excrate_etd_th_bank: FOB_Price_Params.EXC_RATE_3TH_BANK,
            custpage_excrate_etd_bot: FOB_Price_Params.EXC_RATE_BOT,
            // custpage_customer: custpage_customer_id
            // custpage_pddate: custpage_pddate_obj,
            // custpage_location: custpage_location
        });
        context.response.writePage(form);
        return;
    }
    function Page2_FOB_Price_Update_Data(context, params) {
        const { step = '' } = params;
        const { request, response } = context;
        // กรองเฉพาะ key ที่ขึ้นต้นด้วย "custpage_"
        let paramsValueObj = getFieldParams(params);
        let recid = paramsValueObj?.custpage_document_number;
        if (!recid) {
            throw 'Please enter value(s) for: Document Number';
        }
        let custbody_excrate_etd_th_bank = paramsValueObj?.custpage_excrate_etd_th_bank;
        let custbody_excrate_etd_bot = paramsValueObj?.custpage_excrate_etd_bot;
        let sublistFobPriceRateLineCount = request.getLineCount({ group: 'fob_price_rate' });
        let sublistSalesOrderLineCount = request.getLineCount({ group: 'sales_order' });
        let FOB_Price_Rate = {};
        let FOB_Price_Details = [];
        for (let i = 0; i < sublistFobPriceRateLineCount; i++) {
            let rate_type = request.getSublistValue({ group: 'fob_price_rate', name: 'rate_type', line: i });
            let rate = request.getSublistValue({ group: 'fob_price_rate', name: 'rate', line: i });
            let rate_setup_percent = request.getSublistValue({ group: 'fob_price_rate', name: 'value_is_percentage', line: i });
            let enable_editing = request.getSublistValue({ group: 'fob_price_rate', name: 'enable_editing', line: i });
            let exchange_rate_currency = request.getSublistValue({ group: 'fob_price_rate', name: 'exchange_rate_currency', line: i });
            let currency = request.getSublistValue({ group: 'fob_price_rate', name: 'currency', line: i });
            // Mapping Field for Sale Order
            let fieldMapping = PRICE_RATE_FIELDS[rate_type];
            if (fieldMapping) {
                FOB_Price_Rate[fieldMapping] = {
                    rate_type: rate_type,
                    rate: rate,
                    currency: currency,
                    exchange_rate_currency: Number(exchange_rate_currency),
                    value_is_percentage: (rate_setup_percent === 'T') ? true : false,
                    enable_editing: (enable_editing === 'T') ? true : false
                };
            }
        }
        let custbody_fob_net_amount_original = 0; // FOB Net Amount (Original Currency)
        let custbody_fob_net_amount_thaibank = 0; // custcol_fob_net_amt_thb
        let custbody_fob_net_amount_base_currency = 0; // FOB Net Amount (Base Currency)
        for (let i = 0; i < sublistSalesOrderLineCount; i++) {
            let item = request.getSublistValue({ group: 'sales_order', name: 'item', line: i });
            let item_type = request.getSublistValue({ group: 'sales_order', name: 'item_type', line: i });
            let lineuniquekey = request.getSublistValue({ group: 'sales_order', name: 'lineuniquekey', line: i });
            let custcol_freight_net_weight_ton = request.getSublistValue({ group: 'sales_order', name: 'qty_ton', line: i });
            let custcol_freight_amount = request.getSublistValue({ group: 'sales_order', name: 'freight_amt', line: i });
            let custcol_dthc_amount = request.getSublistValue({ group: 'sales_order', name: 'dthc_amt', line: i });
            let custcol_truck_amount = request.getSublistValue({ group: 'sales_order', name: 'truck_amt', line: i });
            let custcol_other_oversea_amount = request.getSublistValue({ group: 'sales_order', name: 'other_oversea_amt', line: i });
            let custcol_insurance_amount = request.getSublistValue({ group: 'sales_order', name: 'insurance_amt', line: i });
            let custcol_duty_amount = request.getSublistValue({ group: 'sales_order', name: 'duty_amt', line: i });
            let custcol_fob_net_amount_original = request.getSublistValue({ group: 'sales_order', name: 'fob_net_amountorg_currency', line: i });
            let custcol_fob_net_amt_thb = request.getSublistValue({ group: 'sales_order', name: 'fob_net_amt_3th_bank_thb', line: i });
            let custcol_fob_net_amt_bot = request.getSublistValue({ group: 'sales_order', name: 'fob_net_amt_bot_rate_thb', line: i });
            let warehouse_per_ton = request.getSublistValue({ group: 'sales_order', name: 'warehouse_per_ton', line: i });
            let custcol_warehouse_amount = request.getSublistValue({ group: 'sales_order', name: 'warehouse_amt', line: i });
            let port_charge_per_ton = request.getSublistValue({ group: 'fob_price_rate', name: 'dthc_per_ton', line: i });
            let freight_per_ton = request.getSublistValue({ group: 'fob_price_rate', name: 'freight_per_ton', line: i });
            let amount = request.getSublistValue({ group: 'sales_order', name: 'amount', line: i });
            let net_amount = request.getSublistValue({ group: 'sales_order', name: 'net_amount', line: i });
            let amount_thb = request.getSublistValue({ group: 'sales_order', name: 'amount_thb', line: i });
            let fob_gross_amt = request.getSublistValue({ group: 'sales_order', name: 'fob_gross_amt', line: i });
            // let fob_net_amount_original_per = (Number(custcol_freight_net_weight_ton) / Number(custcol_fob_net_amount_original)) || 0;
            let fob_net_amount_original_per = libCode.dividedNumber(custcol_fob_net_amount_original, custcol_freight_net_weight_ton);
            // กรองเอา Item ที่ไม่ใช้ Subtotal, Discount
            if (['Subtotal', 'Discount'].includes(item_type) === false) {
                custbody_fob_net_amount_original = libCode.addNumber(custcol_fob_net_amount_original, custbody_fob_net_amount_original);
                custbody_fob_net_amount_thaibank = libCode.addNumber(custcol_fob_net_amt_thb, custbody_fob_net_amount_thaibank);
                custbody_fob_net_amount_base_currency = libCode.addNumber(custcol_fob_net_amt_bot, custbody_fob_net_amount_base_currency);
                FOB_Price_Details.push({
                    item,
                    lineuniquekey,
                    custcol_freight_net_weight_ton,
                    custcol_freight_amount,
                    custcol_dthc_amount,
                    custcol_truck_amount,
                    custcol_other_oversea_amount,
                    custcol_insurance_amount,
                    custcol_duty_amount,
                    custcol_warehouse_amount,
                    custcol_fob_net_amount_original, // FOB Net Amount (Original Currency)
                    custcol_fob_net_amt_thb, // FOB Net Amt. 3TH Bank (THB)
                    custcol_fob_net_amt_bot, // FOB Net Amt. BOT Rate (THB)
                    custcol_fob_gross_amt: Number(fob_gross_amt),
                    port_charge_per_ton,
                    freight_per_ton,
                    fob_net_amount_original_per
                });
            }
        }
        // throw new Error(JSON.stringify(FOB_Price_Rate));
        let cRecord = record.load({ type: record.Type.SALES_ORDER, id: recid, isDynamic: false });
        /**
         * Update FOB Price rate to Body SO
         *  - Freight
         *  - DTHC
         *  - Truck
         *  - Other Oversea
         *  - Insurance
         *  - Duty
         */
        for (const field_id in FOB_Price_Rate) {
            if (Object.prototype.hasOwnProperty.call(FOB_Price_Rate, field_id)) {
                const { rate, currency, exchange_rate_currency } = FOB_Price_Rate[field_id];
                if (rate) {
                    cRecord.setValue({ fieldId: field_id, value: rate });
                }
                switch (field_id) {
                    case 'custbody_fob_freight_rate':
                        /**
                         * Freight Currency = custbody_fob_freight_currency
                         * Freight Exchange rate = custbody_fob_freight_exrate
                         */
                        if (currency) {
                            cRecord.setValue({ fieldId: 'custbody_fob_freight_currency', value: currency });
                        }
                        if (rate) {
                            cRecord.setValue({ fieldId: 'custbody_freight_per_con_org_curr', value: rate });
                        }
                        if (exchange_rate_currency) {
                            cRecord.setValue({ fieldId: 'custbody_fob_freight_exrate', value: exchange_rate_currency });
                        }
                        break;
                    case 'custbody_fob_dthc_rate':
                        /**
                         * DTHC Currency = custbody_foc_dthc_currency
                         * DTHC Exchange rate = custbody_fob_dthc_exrate
                         */
                        if (currency) {
                            cRecord.setValue({ fieldId: 'custbody_foc_dthc_currency', value: currency });
                        }
                        if (exchange_rate_currency) {
                            cRecord.setValue({ fieldId: 'custbody_fob_dthc_exrate', value: exchange_rate_currency });
                        }
                        break;
                    default:
                        break;
                }
            }
        }
        let custbody_total_freight_amount = 0;
        let custbody_total_dthc_amount = 0;
        let custbody_total_truck_amount = 0;
        let custbody_total_other_oversea_amount = 0;
        let custbody_total_duty_amount = 0;
        let custbody_total_insurance_amount = 0;
        let custbody_total_warehouse_amount = 0;
        log.debug({
            title: 'Price Rate Fields',
            details: PRICE_RATE_FIELDS
        });
        log.debug({
            title: 'FOB Price Details',
            details: FOB_Price_Details
        });
        FOB_Price_Details.forEach(function (row, index) {
            const { item, lineuniquekey, custcol_freight_net_weight_ton = 0, custcol_freight_amount = 0, custcol_dthc_amount = 0, custcol_truck_amount = 0, custcol_other_oversea_amount = 0, custcol_insurance_amount = 0, custcol_warehouse_amount = 0, custcol_duty_amount = 0, custcol_fob_net_amount_original = 0, custcol_fob_net_amt_thb = 0, custcol_fob_net_amt_bot = 0, custcol_fob_gross_amt = 0, port_charge_per_ton, freight_per_ton, fob_net_amount_original_per } = row;
            let findIndex = cRecord.findSublistLineWithValue({ sublistId: 'item', fieldId: 'lineuniquekey', value: lineuniquekey });
            if (findIndex !== -1) {
                if (custcol_freight_net_weight_ton) {
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_freight_net_weight_ton', value: Number(libCode.toFixed2(custcol_freight_net_weight_ton, 8)) });
                }
                if (custcol_freight_amount) {
                    custbody_total_freight_amount = libCode.addNumber(custcol_freight_amount, custbody_total_freight_amount);
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_freight_amount', value: Number(libCode.toFixed2(custcol_freight_amount, 8)) });
                }
                if (custcol_dthc_amount) {
                    custbody_total_dthc_amount = libCode.addNumber(custcol_dthc_amount, custbody_total_dthc_amount);
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_dthc_amount', value: Number(libCode.toFixed2(custcol_dthc_amount, 8)) });
                }
                if (custcol_truck_amount) {
                    custbody_total_truck_amount = libCode.addNumber(custcol_truck_amount, custbody_total_truck_amount);
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_truck_amount', value: Number(libCode.toFixed2(custcol_truck_amount, 8)) });
                }
                if (custcol_other_oversea_amount) {
                    custbody_total_other_oversea_amount = libCode.addNumber(custcol_other_oversea_amount, custbody_total_other_oversea_amount);
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_other_oversea_amount', value: Number(libCode.toFixed2(custcol_other_oversea_amount, 8)) });
                }
                if (custcol_insurance_amount) {
                    custbody_total_insurance_amount = libCode.addNumber(custcol_insurance_amount, custbody_total_insurance_amount);
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_insurance_amount', value: Number(libCode.toFixed2(custcol_insurance_amount, 8)) });
                }
                if (custcol_duty_amount) {
                    custbody_total_duty_amount = libCode.addNumber(custcol_duty_amount, custbody_total_duty_amount);
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_duty_amount', value: Number(libCode.toFixed2(custcol_duty_amount, 8)) });
                }
                if (custcol_fob_net_amount_original) {
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_fob_net_amount_original', value: Number(libCode.toFixed2(custcol_fob_net_amount_original, 8)) });
                }
                if (custcol_fob_net_amt_thb) {
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_fob_net_amt_thb', value: Number(libCode.toFixed2(custcol_fob_net_amt_thb, 8)) });
                }
                if (custcol_fob_net_amt_bot) {
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_fob_net_amt_bot', value: Number(libCode.toFixed2(custcol_fob_net_amt_bot, 8)) });
                }
                if (custcol_fob_gross_amt) {
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_fob_gross_amt', value: Number(libCode.toFixed2(custcol_fob_gross_amt, 8)) });
                }
                if (custcol_warehouse_amount) {
                    custbody_total_warehouse_amount = libCode.addNumber(custbody_total_warehouse_amount, custcol_warehouse_amount);
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_fob_warehose_amt', value: Number(libCode.toFixed2(custcol_warehouse_amount, 8)) });
                }
                if (port_charge_per_ton) {
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_fob_dthc_per_mt', value: Number(libCode.toFixed2(port_charge_per_ton, 8)) });
                }
                if (freight_per_ton) {
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_fob_freight_prt_mt', value: Number(libCode.toFixed2(freight_per_ton, 8)) });
                }
                if (fob_net_amount_original_per) {
                    cRecord.setSublistValue({ sublistId: 'item', line: findIndex, fieldId: 'custcol_fob_net_amount_original_per_m', value: Number(libCode.toFixed2(fob_net_amount_original_per, 8)) });
                }
            }
        });
        log.debug({
            title: 'Fob body Field',
            details: {
                custbody_total_freight_amount,
                custbody_total_dthc_amount,
                custbody_total_truck_amount,
                custbody_total_other_oversea_amount,
                custbody_total_duty_amount,
                custbody_total_insurance_amount,
                custbody_total_warehouse_amount,
                custbody_fob_net_amount_original,
                custbody_fob_net_amount_thaibank,
                custbody_fob_net_amount_base_currency,
            }
        });
        cRecord.setValue({ fieldId: 'custbody_fob_net_amount_original', value: libCode.toFixed2(custbody_fob_net_amount_original, 2) });
        cRecord.setValue({ fieldId: 'custbody_fob_net_amount_thaibank', value: custbody_fob_net_amount_thaibank });
        cRecord.setValue({ fieldId: 'custbody_fob_net_amount_base_currency', value: custbody_fob_net_amount_base_currency });
        if (custbody_excrate_etd_th_bank) {
            cRecord.setValue({ fieldId: 'custbody_excrate_etd_th_bank', value: custbody_excrate_etd_th_bank });
        }
        if (custbody_excrate_etd_bot) {
            cRecord.setValue({ fieldId: 'custbody_excrate_etd_bot', value: custbody_excrate_etd_bot });
        }
        cRecord.setValue({ fieldId: 'custbody_total_freight_amount', value: custbody_total_freight_amount });
        cRecord.setValue({ fieldId: 'custbody_total_dthc_amount', value: custbody_total_dthc_amount });
        cRecord.setValue({ fieldId: 'custbody_total_truck_amount', value: custbody_total_truck_amount });
        cRecord.setValue({ fieldId: 'custbody_total_other_oversea_amount', value: custbody_total_other_oversea_amount });
        cRecord.setValue({ fieldId: 'custbody_total_duty_amount', value: custbody_total_duty_amount });
        cRecord.setValue({ fieldId: 'custbody_total_insurance_amount', value: custbody_total_insurance_amount });
        cRecord.setValue({ fieldId: 'custbody_total_warehouse_amount', value: custbody_total_warehouse_amount });
        cRecord.save({ ignoreMandatoryFields: true });
        redirect.toRecord({ type: record.Type.SALES_ORDER, id: recid });
        return true;
        // context.response.write(JSON.stringify({ message: 'Success', FOB_Price_Rate, FOB_Price_Details }, null, 5));
    }
    const CONTAINER_OR_TON = {
        'Container': '1',
        'TON': '2'
    };
    function CalculationFOBPrice({ FOB_Price_Params, FOB_Price_Rate, qty_ton = 0, amount_current = 0, net_amount_current = 0, sumtotal_amount = 0, total_net_amount_current = 0, ignore_container_fobprice = false }) {
        // FOB Price Rate
        let no_of_container = FOB_Price_Params.NO_OF_CONTAINER || 0;
        let net_weight = FOB_Price_Params.NET_WEIGHT || 0;
        let exc_rate_usd = FOB_Price_Params.EXC_RATE_USD || 0;
        let exc_rate_3th_bank = FOB_Price_Params.EXC_RATE_3TH_BANK || 0;
        let exc_rate_usd_to_current = FOB_Price_Params.EXC_RATE_USD_TO_CURRENT || 0;
        let exc_rate_bot = FOB_Price_Params.EXC_RATE_BOT || 0;
        const FIX_DECIMAL = FOB_Price_Params.CURRENCY_DIGIT;
        // FOB Price Params
        let freight = FOB_Price_Rate[PRICE_RATE_TYPE.FREIGHT]?.rate_setup_rate || 0;
        let dthc = FOB_Price_Rate[PRICE_RATE_TYPE.DESTINATION_PORT]?.rate_setup_rate || 0;
        let truck = Number(FOB_Price_Rate[PRICE_RATE_TYPE.TRUCK]?.rate_setup_rate) || 0;
        let other_oversea = Number(FOB_Price_Rate[PRICE_RATE_TYPE.SHUTTLE_PORT]?.rate_setup_rate) || 0;
        let warehouse = Number(FOB_Price_Rate[PRICE_RATE_TYPE.WAREHOUSE]?.rate_setup_rate) || 0;
        let insurance = Number(FOB_Price_Rate[PRICE_RATE_TYPE.INSURANCE]?.rate_setup_rate) || 0;
        let duty = FOB_Price_Rate[PRICE_RATE_TYPE.DUTY]?.rate_setup_rate || 0;
        // Per Container or TON
        let is_container_freight = FOB_Price_Rate[PRICE_RATE_TYPE.FREIGHT]?.fobprice_rate_per || CONTAINER_OR_TON.Container;
        let is_container_dthc = FOB_Price_Rate[PRICE_RATE_TYPE.DESTINATION_PORT]?.fobprice_rate_per || CONTAINER_OR_TON.Container;
        let is_container_truck = FOB_Price_Rate[PRICE_RATE_TYPE.TRUCK]?.fobprice_rate_per || CONTAINER_OR_TON.Container;
        let is_container_other_oversea = FOB_Price_Rate[PRICE_RATE_TYPE.SHUTTLE_PORT]?.fobprice_rate_per || CONTAINER_OR_TON.Container;
        let is_container_insurance = FOB_Price_Rate[PRICE_RATE_TYPE.INSURANCE]?.fobprice_rate_per || CONTAINER_OR_TON.Container;
        let is_container_duty = FOB_Price_Rate[PRICE_RATE_TYPE.DUTY]?.fobprice_rate_per || CONTAINER_OR_TON.Container;
        let setup_minamount = FOB_Price_Rate[PRICE_RATE_TYPE.INSURANCE]?.minamount || 0;
        let setup_stdrate = FOB_Price_Rate[PRICE_RATE_TYPE.INSURANCE]?.stdrate || 0;
        let setup_insurance_stdrate = (total_net_amount_current * (setup_stdrate / 100) * (insurance / 100)) || 0;
        let setup_minimum_amout = (setup_minamount / exc_rate_usd) || 0;
        let minimum_rate = (setup_minamount / exc_rate_3th_bank);
        let minimum_rate_per_line = (minimum_rate * (net_amount_current / total_net_amount_current));
        // Exchange Rate Currency
        let exRateFreight = FOB_Price_Rate[PRICE_RATE_TYPE.FREIGHT]?.exchange_rate_currency || 0;
        let exRateInsurance = FOB_Price_Rate[PRICE_RATE_TYPE.INSURANCE]?.exchange_rate_currency || 0;
        let exRateDthc = FOB_Price_Rate[PRICE_RATE_TYPE.DESTINATION_PORT]?.exchange_rate_currency || 0;
        let exRateTruck = FOB_Price_Rate[PRICE_RATE_TYPE.TRUCK]?.exchange_rate_currency || 0;
        let exRateDuty = FOB_Price_Rate[PRICE_RATE_TYPE.DUTY]?.exchange_rate_currency || 0;
        let exRateOtherOversea = FOB_Price_Rate[PRICE_RATE_TYPE.SHUTTLE_PORT]?.exchange_rate_currency || 0;
        let exRateWarehouse = FOB_Price_Rate[PRICE_RATE_TYPE.SHUTTLE_PORT]?.exchange_rate_currency || 0;
        /**
         * 1. Freight
         * freight_per_ton = ((Freight * Exc.Rate USD to SAR) * No. of Container) / Net Weight
         * freight_amt = (Freight (Per Ton) * Qty. (Ton))
         */
        let freight_per_ton = 0;
        let freight_amt = 0;
        if (is_container_freight == CONTAINER_OR_TON.TON) {
            freight_per_ton = ((freight * exRateFreight));
            freight_amt = (freight_per_ton * qty_ton);
        }
        else {
            // aHR0cHM6Ly90ZWlidG8uc2xhY2suY29tL2FyY2hpdmVzL0MwOVRLNUNTUTNBL3AxNzcxOTkwMDM5NDI5MjU5
            if (ignore_container_fobprice == true) {
                freight_per_ton = ((freight * exRateFreight)) / net_weight;
                freight_amt = (freight_per_ton * qty_ton);
            }
            else {
                freight_per_ton = ((freight * exRateFreight) * no_of_container) / net_weight;
                freight_amt = (freight_per_ton * qty_ton);
            }
        }
        log.debug({
            title: 'Freight Calculation', details: {
                freight_per_ton,
                freight_amt,
                is_container_freight,
                no_of_container,
                net_weight,
                qty_ton,
                freight,
                exRateFreight,
                ignore_container_fobprice
            }
        });
        /**
         * 2. DTHC
         * dthc_per_ton = ((DTHC * Exc.Rate USD to SAR) * No. of Container) / Net Weight
         */
        let dthc_per_ton = 0;
        let dthc_amt = 0;
        if (is_container_dthc == CONTAINER_OR_TON.TON) {
            dthc_per_ton = (((dthc * exRateDthc)));
            dthc_amt = (dthc_per_ton * qty_ton);
        }
        else {
            dthc_per_ton = (((dthc * exRateDthc) * no_of_container) / net_weight);
            dthc_amt = (dthc_per_ton * qty_ton);
        }
        /**
         * 3. Truck
         * truck_per_ton = ((Truck * Exc.Rate USD to SAR) * No. of Container) / Net Weight
         */
        let truck_per_ton = 0;
        let truck_amt = 0;
        if (is_container_truck == CONTAINER_OR_TON.TON) {
            truck_per_ton = (((truck * exRateTruck)));
            truck_amt = (truck_per_ton * qty_ton);
        }
        else {
            truck_per_ton = (((truck * exRateTruck) * no_of_container) / net_weight);
            truck_amt = (truck_per_ton * qty_ton);
        }
        // 4. Other oversea
        let other_oversea_per_ton = 0;
        let other_oversea_amt = 0;
        if (is_container_truck == CONTAINER_OR_TON.TON) {
            other_oversea_per_ton = (((other_oversea * exRateOtherOversea)));
            other_oversea_amt = (other_oversea_per_ton * qty_ton);
        }
        else {
            other_oversea_per_ton = (((other_oversea * exRateOtherOversea) * no_of_container) / net_weight);
            other_oversea_amt = (other_oversea_per_ton * qty_ton);
        }
        // 5. Insurance
        // Insurance (Standard Rate%)
        let insurance_standard_rate = Number(setup_insurance_stdrate * (amount_current / sumtotal_amount));
        if (insurance_standard_rate === Infinity || insurance_standard_rate === -Infinity) {
            insurance_standard_rate = 0;
        }
        // Minimum Amount * (Net amount (SGD) / Total Net amount (SGD))
        let insurance_minimum = (minimum_rate * (net_amount_current / total_net_amount_current));
        // log.debug({ title: 'insurance_minimum', details: `(${minimum_rate} * (${net_amount_current} / ${total_net_amount_current})) = ${insurance_minimum}` });
        /**
         * IF Standard Rate > Minimum Rate per Line THEN Insurance Amt. = Standard Rate ELSE Insurance Amt. = Minimum Rate per Line
         */
        let insurance_amt = (insurance_standard_rate > insurance_minimum) ? insurance_standard_rate : insurance_minimum;
        // log.debug({
        //     title: 'Insurance Calculation',
        //     details: {
        //         setup_minamount,
        //         insurance_standard_rate,
        //         setup_minimum_amout,
        //         insurance_minimum,
        //         setup_insurance_stdrate,
        //         net_amount_current,
        //         total_net_amount_current,
        //         amount_current,
        //         sumtotal_amount,
        //         insurance_amt,
        //     }
        // });
        // 6. Duty
        // let duty_per_ton = (((duty * exc_rate_usd_to_current) * no_of_container) / net_weight);
        let duty_amt = (net_amount_current * (duty / 100));
        // let fob_gross_amt = 0;
        // 10. Warehouse
        let warehouse_per_ton = 0;
        let warehouse_amt = 0;
        if (is_container_truck == CONTAINER_OR_TON.TON) {
            warehouse_per_ton = (((warehouse * exRateOtherOversea)) / net_weight);
            warehouse_amt = (warehouse_per_ton * qty_ton);
        }
        else {
            warehouse_per_ton = (((warehouse * exRateOtherOversea) * no_of_container) / net_weight);
            warehouse_amt = (warehouse_per_ton * qty_ton);
        }
        // 7 FOB Net Amount(Org. currency)
        let fob_net_amountorg_currency = (roundTo(net_amount_current, FIX_DECIMAL) - roundTo(freight_amt, FIX_DECIMAL) - roundTo(dthc_amt, FIX_DECIMAL) - roundTo(truck_amt, FIX_DECIMAL) - roundTo(other_oversea_amt, FIX_DECIMAL) - roundTo(insurance_amt, FIX_DECIMAL) - roundTo(duty_amt, FIX_DECIMAL) - roundTo(warehouse_amt, FIX_DECIMAL));
        // 8. FOB Net Amt. 3TH Bank (THB)
        let fob_net_amt_3th_bank_thb = (roundTo(fob_net_amountorg_currency, FIX_DECIMAL) * exc_rate_3th_bank);
        // log.debug({
        //     title: 'FOB Net Amount Calculation',
        //     details: {
        //         net_amount_current,
        //         fob_net_amountorg_currency,
        //         exc_rate_3th_bank,
        //         fob_net_amt_3th_bank_thb
        //     }
        // });
        // 9. FOB Net Amt. BOT Rate (THB)
        let fob_net_amt_bot_rate_thb = (roundTo(fob_net_amountorg_currency, FIX_DECIMAL) * exc_rate_bot);
        // log.debug({
        //     title: 'FOB Price Calculation',
        //     details: {
        //         is_container_truck,
        //         warehouse,
        //         net_weight,
        //         no_of_container,
        //         exRateOtherOversea,
        //         warehouse_per_ton,
        //         warehouse_amt,
        //     }
        // });
        return {
            freight_per_ton: (isFinite(freight_per_ton) ? freight_per_ton : 0),
            freight_amt: (isFinite(freight_amt) ? freight_amt : 0),
            dthc_per_ton: (isFinite(dthc_per_ton) ? dthc_per_ton : 0),
            dthc_amt: (isFinite(dthc_amt) ? dthc_amt : 0),
            truck_per_ton: (isFinite(truck_per_ton) ? truck_per_ton : 0),
            truck_amt: (isFinite(truck_amt) ? truck_amt : 0),
            other_oversea_per_ton: (isFinite(other_oversea_per_ton) ? other_oversea_per_ton : 0),
            other_oversea_amt: (isFinite(other_oversea_amt) ? other_oversea_amt : 0),
            warehouse_per_ton: (isFinite(warehouse_per_ton) ? warehouse_per_ton : 0),
            warehouse_amt: (isFinite(warehouse_amt) ? warehouse_amt : 0),
            insurance_standard_rate: (isFinite(insurance_standard_rate) ? insurance_standard_rate : 0),
            insurance_minimum: (isFinite(insurance_minimum) ? insurance_minimum : 0),
            insurance_amt: (isFinite(insurance_amt) ? insurance_amt : 0),
            duty_amt: (isFinite(duty_amt) ? duty_amt : 0),
            fob_net_amountorg_currency: (isFinite(fob_net_amountorg_currency) ? fob_net_amountorg_currency : 0),
            fob_net_amt_3th_bank_thb: (isFinite(fob_net_amt_3th_bank_thb) ? fob_net_amt_3th_bank_thb : 0),
            exc_rate_bot: (isFinite(exc_rate_bot) ? exc_rate_bot : 0),
            fob_net_amt_bot_rate_thb: (isFinite(fob_net_amt_bot_rate_thb) ? fob_net_amt_bot_rate_thb : 0),
            // fob_gross_amt: (isFinite(fob_net_amountorg_currency) ? (fob_net_amountorg_currency) : 0)
        };
    }
    const FOBPriceModule = (function () {
        /*========================================= Repositories ==============================*/
        function createUIFormAndFields() {
            let form;
            form = ui.createForm({
                title: 'FOB Price',
                hideNavBar: false,
            });
            // Field Body
            form.addFieldGroup({
                id: 'g_info',
                label: 'Primary Information'
            });
            form.addTab({ id: 'tab_1', label: 'FOB Price Rate' });
            form.addTab({ id: 'tab_2', label: 'Detail' });
            // let fobPriceGroup = form.addFieldGroup({
            //     id: 'g_fob_price_rate',
            //     label: 'FOB Price Rate'
            // });
            // fobPriceGroup.isCollapsed = true;
            // HIDDEN Fields
            form.addField({ id: 'step', type: ui.FieldType.TEXT, label: 'Step' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            form.addField({ id: 'step_current', type: ui.FieldType.TEXT, label: 'Step' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            form.addField({ id: 'script_id', type: ui.FieldType.TEXT, label: 'Script Id' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            form.addField({ id: 'script_deploy_id', type: ui.FieldType.TEXT, label: 'Script Deploy Id' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            form.addField({ id: 'custpage_inprogress_bar', type: ui.FieldType.INLINEHTML, label: 'Inprogress Bar' }); //.updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            form.addField({ id: 'custpage_excrate_etd_th_bank', type: ui.FieldType.TEXT, label: 'excrate etd th bank' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            form.addField({ id: 'custpage_excrate_etd_bot', type: ui.FieldType.TEXT, label: 'excrate etd bot' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            form.addField({ id: 'custpage_trace', type: ui.FieldType.INLINEHTML, label: 'trace' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            let custpageHtmlStyle = form.addField({ id: 'custpage_html_style', type: ui.FieldType.INLINEHTML, label: 'Style' }); //.updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            custpageHtmlStyle.defaultValue = `
    <style>
    #fob_price_rate_splits {
        width: 700px;
    }

    #sales_order_splits > tbody > tr > td:nth-child(1){
        min-width: 330px!important;
    }
    </style>
    `;
            // Field Body
            form.addField({ id: 'custpage_document_number', type: ui.FieldType.SELECT, label: 'Document Number', source: 'transaction', container: 'g_info' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            form.addField({ id: 'custpage_customer', type: ui.FieldType.SELECT, label: 'Customer', source: 'customer', container: 'g_info' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            form.addField({ id: 'custpage_country', type: ui.FieldType.SELECT, label: 'Country', source: 'customrecord_cseg_cust_country', container: 'g_info' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            form.addField({ id: 'custpage_country_zone', type: ui.FieldType.SELECT, label: 'Country Zone', source: 'customrecord_country_zone', container: 'g_info' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            form.addField({ id: 'custpage_port', type: ui.FieldType.SELECT, label: 'Port', source: 'customrecord_port', container: 'g_info' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            form.addField({ id: 'custpage_incoterm', type: ui.FieldType.SELECT, label: 'Incoterm', source: 'customrecord_customer_incoterms', container: 'g_info' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            form.addField({ id: 'custpage_net_amount', type: ui.FieldType.CURRENCY, label: 'Net Amount', source: '', container: 'g_info' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            form.addField({ id: 'custpage_currency', type: ui.FieldType.SELECT, label: 'Currency', source: 'currency', container: 'g_info' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            form.addField({ id: 'custpage_fob_price_params', type: ui.FieldType.INLINEHTML, label: 'Fob Price Params', source: '', container: 'g_info' });
            return form;
        }
        /**
         * Create Sublist For Details
         * sales_order
         * @param form
         * @returns
         */
        function createSublistFobDetail(form, FOB_Price_SO) {
            let currencyText = FOB_Price_SO?.custpage_currency_text || '';
            let sublistSalesOrder = form.addSublist({ id: 'sales_order', type: ui.SublistType.LIST, label: 'Detail', tab: 'tab_2' });
            sublistSalesOrder.addField({ id: 'item_type', type: ui.FieldType.TEXT, source: '', label: 'Item Type' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            sublistSalesOrder.addField({ id: 'item', type: ui.FieldType.SELECT, source: 'item', label: 'Item' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            sublistSalesOrder.addField({ id: 'lineuniquekey', type: ui.FieldType.TEXT, source: '', label: 'Line Unique Key' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            // Unit price (DDP)
            sublistSalesOrder.addField({ id: 'unit_price_ddp', type: ui.FieldType.FLOAT, label: 'Unit Price' });
            // Qty. in Transaction Unit (TON)
            sublistSalesOrder.addField({ id: 'qty_in_transaction_unit_ton', type: ui.FieldType.FLOAT, label: 'Qty. in Transaction Unit' });
            // Unit
            sublistSalesOrder.addField({ id: 'unit', type: ui.FieldType.TEXT, label: 'Unit' });
            // Qty. (Ton)
            sublistSalesOrder.addField({ id: 'qty_ton', type: ui.FieldType.FLOAT, label: 'Net Weight (MT)' });
            // Amount (USD)
            sublistSalesOrder.addField({ id: 'amount', type: ui.FieldType.FLOAT, label: 'Amount (' + currencyText + ')' });
            // Subtotal Discount
            sublistSalesOrder.addField({ id: 'subtotal_discount', type: ui.FieldType.FLOAT, label: 'Subtotal Discount' });
            // Net amount
            sublistSalesOrder.addField({ id: 'net_amount', type: ui.FieldType.FLOAT, label: 'Net amount(' + currencyText + ')' });
            // Exc.Rate (3TH Bank)
            sublistSalesOrder.addField({ id: 'excrate_3th_bank', type: ui.FieldType.FLOAT, label: 'Exc.Rate (3TH Bank)' });
            // Amount (THB)
            sublistSalesOrder.addField({ id: 'amount_thb', type: ui.FieldType.FLOAT, label: 'Amount (THB)' });
            // Freight (Per Ton)
            sublistSalesOrder.addField({ id: 'freight_per_ton', type: ui.FieldType.FLOAT, label: 'Freight (Per MT)' });
            // Freight (Amt)
            sublistSalesOrder.addField({ id: 'freight_amt', type: ui.FieldType.FLOAT, label: 'Freight (Amt)' }); //.updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
            // DTHC (Per Ton)
            sublistSalesOrder.addField({ id: 'dthc_per_ton', type: ui.FieldType.FLOAT, label: 'Destination port charge + Custom clearance (Per MT)' });
            // DTHC (Amt)
            sublistSalesOrder.addField({ id: 'dthc_amt', type: ui.FieldType.FLOAT, label: 'Destination port charge + Custom clearance (Amt)' }); //.updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
            // Truck (Per Ton)
            sublistSalesOrder.addField({ id: 'truck_per_ton', type: ui.FieldType.FLOAT, label: 'Truck to customer (Per MT)' });
            // Truck (Amt)
            sublistSalesOrder.addField({ id: 'truck_amt', type: ui.FieldType.FLOAT, label: 'Truck to customer (Amt)' });
            // Other oversea (Per Ton)
            sublistSalesOrder.addField({ id: 'other_oversea_per_ton', type: ui.FieldType.FLOAT, label: 'Shuttle port to warehouse  (Per MT)' });
            // Other oversea (Amt)
            sublistSalesOrder.addField({ id: 'other_oversea_amt', type: ui.FieldType.FLOAT, label: 'Shuttle port to warehouse  (Amt)' });
            // Warehouse Per Ton
            sublistSalesOrder.addField({ id: 'warehouse_per_ton', type: ui.FieldType.FLOAT, label: 'Warehouse (Per MT)' });
            // Warehouse Amt
            sublistSalesOrder.addField({ id: 'warehouse_amt', type: ui.FieldType.FLOAT, label: 'Warehouse (Amt)' });
            // Insurance (Standard Rate%)
            sublistSalesOrder.addField({ id: 'insurance_standard_rate', type: ui.FieldType.FLOAT, label: 'Insurance (Standard Rate%)' });
            // Insurance (minimum)
            sublistSalesOrder.addField({ id: 'insurance_minimum', type: ui.FieldType.FLOAT, label: 'Insurance (minimum)' });
            // Insurance (Amt)
            sublistSalesOrder.addField({ id: 'insurance_amt', type: ui.FieldType.FLOAT, label: 'Insurance (Amt)' });
            // Duty (Amt)
            sublistSalesOrder.addField({ id: 'duty_amt', type: ui.FieldType.FLOAT, label: 'Duty (Amt)' });
            // 6-
            sublistSalesOrder.addField({ id: 'fob_net_amountorg_currency', type: ui.FieldType.FLOAT, label: 'FOB Net Amount(Org. currency)' }); // .updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
            // FOB Net Amt. 3TH Bank (THB)
            sublistSalesOrder.addField({ id: 'fob_net_amt_3th_bank_thb', type: ui.FieldType.FLOAT, label: 'FOB Net Amt. 3TH Bank (THB)' });
            // BOT rate
            sublistSalesOrder.addField({ id: 'bot_rate', type: ui.FieldType.FLOAT, label: 'BOT rate' });
            // FOB Net Amt. BOT Rate (THB)
            sublistSalesOrder.addField({ id: 'fob_net_amt_bot_rate_thb', type: ui.FieldType.FLOAT, label: 'FOB Net Amt. BOT Rate (THB)' });
            // FOB Gross Amt
            sublistSalesOrder.addField({ id: 'fob_gross_amt', type: ui.FieldType.FLOAT, label: 'FOB Gross Amt' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            return sublistSalesOrder;
        }
        /**
         * Create Sublist For Details
         * form.addSublist({ id: 'fob_price_rate', type: ui.SublistType.LIST, label: 'FOB Price Rate', tab: 'tab_1' });
         * @param form
         * @returns
         */
        function createSublistFobPriceRate(form, FOB_Price_SO) {
            let currencyText = FOB_Price_SO?.custpage_currency_text || '';
            let sublistObj = form.addSublist({ id: 'fob_price_rate', type: ui.SublistType.LIST, label: 'FOB Price Rate', tab: 'tab_1' });
            // Unit price (DDP)
            sublistObj.addField({ id: 'rate_type', type: ui.FieldType.SELECT, label: 'Rate Type', source: 'customrecord_fobprice_rate_type' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE }); // FOB Price Rate Type
            sublistObj.addField({ id: 'rate', type: ui.FieldType.FLOAT, label: 'Rate' }).updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
            let currentFieldObj = sublistObj.addField({ id: 'currency', type: ui.FieldType.SELECT, label: 'Currency', source: 'currency' }).updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
            sublistObj.addField({ id: 'exchange_rate_currency', type: ui.FieldType.FLOAT, label: 'Exchange Rate (' + currencyText + ')' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            sublistObj.addField({ id: 'value_is_percentage', type: ui.FieldType.CHECKBOX, label: 'Value is Percentage' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            sublistObj.addField({ id: 'enable_editing', type: ui.FieldType.CHECKBOX, label: 'Enable Editing' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            // currentFieldObj.addSelectOption({ value: '', text: '' });
            // currency_list_arr.forEach(function(item,index){
            //     currentFieldObj.addSelectOption(item);
            // });
            return sublistObj;
        }
        function getFobPriceLineItem(internal_id) {
            let ssFilters = [];
            // Document Number
            ssFilters.push({ "name": "internalid", "join": null, "operator": "is", "values": internal_id });
            const SS_SL_FOB_PRICE_LINE = 'customsearch_ss_sl_fob_price_line';
            var ssResults = libCode.loadSavedSearch(null, SS_SL_FOB_PRICE_LINE, ssFilters, []);
            //console.log({ ssResults: ssResults.length });
            log.debug(SS_SL_FOB_PRICE_LINE, { ss_length: ssResults.length, ssFilters: ssFilters });
            return ssResults.map(row => ({
                item_type: row.getValue({ "name": "type", "join": "item", "label": "Type" }),
                amount_foreign_currency: Number(row.getValue({ "name": "fxamount", "label": "Amount (Foreign Currency)" })) || 0,
                quantity: Number(row.getValue({ "name": "quantity", "label": "Quantity" })) || 0,
                tranid: row.getValue({ "name": "tranid", "label": "Document Number" }),
                item: row.getValue({ "name": "item", "label": "Item" }),
                displayname: row.getValue({ "name": "displayname", "join": "item", "label": "Display Name" }),
                unit_price_ddp: Number(row.getValue({ "name": "formulacurrency", "label": "Unit Price", "formula": "{fxamount}/{quantityuom}" })) || 0,
                qty_in_transaction_unit_ton: Number(row.getValue({ "name": "quantityuom", "label": "Quantity in Transaction Units" })) || 0,
                units: row.getValue({ "name": "unitabbreviation", "label": "Units" }),
                stockunit: row.getValue({ "name": "stockunit", "join": "item", "label": "Primary Stock Unit" }),
                amount: row.getValue({ "name": "amount", "label": "Amount" }),
                line: row.getValue({ "name": "line", "label": "Line ID" }),
                lineuniquekey: row.getValue({ "name": "lineuniquekey", "label": "Line Unique Key" }),
                ignore_container_fobprice: row.getValue({ "name": "custrecord_ignore_container_fobprice", "label": "Ignore Container (FOB Price)", "join": "line.cseg_item_sub_group" }) || false,
                custcol_net_weight: row.getValue({ "name": "custcol_net_weight", "label": "Net Weight" }) || 0
            }));
        }
        /**
         * SS - FOB Price Rate Type
         * @returns
         */
        function loadFOBPriceRateType() {
            let ssFilters = [];
            // Internal ID
            // ssFilters.push({ "name": "internalid", "join": null, "operator": "is", "values": PRICE_RATE_TYPE.INSURANCE });
            const SS_FOB_PRICE_RATE_TYPE = 'customsearch_ss_fob_price_rate_type';
            var ssResults = libCode.loadSavedSearch(null, SS_FOB_PRICE_RATE_TYPE, ssFilters, []);
            //console.log({ ssResults: ssResults.length });
            log.debug(SS_FOB_PRICE_RATE_TYPE, { ss_length: ssResults.length, ssFilters: ssFilters });
            let resultsObj = {};
            ssResults.forEach(function (row, index) {
                let name = row.getValue({ "name": "name", "label": "Name" });
                let internalid = row.getValue({ "name": "internalid", "label": "Internal ID" });
                let minamount = row.getValue({ "name": "custrecord_fobprice_rate_type_minamount", "label": "Minimum Amount" });
                let stdrate = row.getValue({ "name": "custrecord_fobprice_rate_type_stdrate", "label": "Standard Rate" });
                if (internalid) {
                    if (resultsObj[internalid] === undefined) {
                        resultsObj[internalid] = {};
                        resultsObj[internalid].minamount = Number(minamount) || 0;
                        resultsObj[internalid].stdrate = Number(stdrate) || 0;
                    }
                }
            });
            return resultsObj;
        }
        /**
         *
         * SEARCH ID : customsearch_ss_fob_price_condi_setup
         *
        @example
        let country = '1'; // Country
        let incoterm = '9'; // Incoterm
    
        let resultsFobPriceCondiSetup = loadSSFobPriceCondiSetup(country, incoterm);
    
        */
        function getFOBPriceCondiSetup(countryId, incotermId) {
            let ssFilters = [];
            // Country
            ssFilters.push({ "name": "custrecord_fobprice_consetup_country", join: null, "operator": "is", "values": countryId });
            // Incoterm
            ssFilters.push({ "name": "custrecord_fobprice_consetup_incoterm", join: null, "operator": "is", "values": incotermId });
            const SS_FOB_PRICE_CONDI_SETUP = 'customsearch_ss_fob_price_condi_setup';
            let ssResults = libCode.loadSavedSearch(null, SS_FOB_PRICE_CONDI_SETUP, ssFilters, []);
            //console.log({ ssResults: ssResults.length });
            log.debug(SS_FOB_PRICE_CONDI_SETUP, { ss_length: ssResults.length, ssFilters: ssFilters });
            if (ssResults.length == 0) {
                return null;
            }
            let row = ssResults[0];
            let name = row.getValue({ "name": "name", "label": "Name" });
            let country = row.getValue({ "name": "custrecord_fobprice_consetup_country", "label": "Country" });
            let incoterm = row.getValue({ "name": "custrecord_fobprice_consetup_incoterm", "label": "Incoterm" });
            let use_port = row.getValue({ "name": "custrecord_fobprice_consetup_useport", "label": "Use Port" }) || false;
            let use_zone = row.getValue({ "name": "custrecord_fobprice_consetup_usezone", "label": "Use Zone" }) || false;
            let use_sales_channel = row.getValue({ "name": "custrecord_use_sales_channel", "label": "Use Sales Channel" }) || false;
            return {
                name: name,
                country: country,
                incoterm: incoterm,
                use_port: use_port,
                use_zone: use_zone,
                use_sales_channel: use_sales_channel
            };
        }
        /**
         * SS_FOB_PRICE_SETUP : customsearch_ss_fob_price_setup
         * @param FOB_Price_SO
         * @returns
         */
        function getFOBPriceSetup(FOB_Price_SO = {}) {
            let ssFilters = [];
            // Country
            if (FOB_Price_SO.custpage_country) {
                ssFilters.push({ "name": "custrecord_fobprice_setup_country", "join": null, "operator": "is", "values": FOB_Price_SO.custpage_country });
            }
            // Incoterm
            if (FOB_Price_SO.custpage_incoterm) {
                ssFilters.push({ "name": "custrecord_fobprice_setup_incoterm", "join": null, "operator": "is", "values": FOB_Price_SO.custpage_incoterm });
            }
            /**
             * เช็คกับตั้งค่าว่าจะ Filter อะไรเพิ่มบ้าง
             * โดยดูใน FOB Price Condition Setup
             */
            if (FOB_Price_SO.custpage_incoterm && FOB_Price_SO.custpage_country) {
                let resultsFobPriceCondiSetup = getFOBPriceCondiSetup(FOB_Price_SO.custpage_country, FOB_Price_SO.custpage_incoterm);
                if (resultsFobPriceCondiSetup) {
                    // Port
                    if (resultsFobPriceCondiSetup.use_port) {
                        // Use Port
                        // ssFilters.push({ "name": "custrecord_fobprice_setup_useport", "join": null, "operator": "is", "values": true });
                        ssFilters.push({ "name": "custrecord_fobprice_setup_port", "join": null, "operator": "is", "values": FOB_Price_SO.custpage_port });
                    }
                    if (resultsFobPriceCondiSetup.use_zone && FOB_Price_SO.custpage_country_zone) {
                        ssFilters.push({ "name": "custrecord_fobprice_setup_region", "join": null, "operator": "is", "values": FOB_Price_SO.custpage_country_zone });
                    }
                    if (resultsFobPriceCondiSetup.use_sales_channel) {
                        ssFilters.push({ "name": "custrecord_fobprice_setup_salesch", "join": null, "operator": "is", "values": FOB_Price_SO.custpage_sales_channel });
                    }
                }
            }
            // Region
            // if (FOB_Price_SO.custpage_region) {
            //     ssFilters.push({ "name": "custrecord_fobprice_setup_region", "join": null, "operator": "is", "values": FOB_Price_SO.custpage_region });
            // }
            // Effective Start Date 
            ssFilters.push({
                name: "custrecord_fobprice_setup_startdate",
                operator: 'onorbefore',
                values: FOB_Price_SO.custpage_date_start
            });
            // Effective End Date
            ssFilters.push({
                name: "custrecord_fobprice_setup_enddate",
                operator: 'onorafter',
                values: FOB_Price_SO.custpage_date_start
            });
            const SS_FOB_PRICE_SETUP = 'customsearch_ss_fob_price_setup';
            var ssResults = libCode.loadSavedSearch(null, SS_FOB_PRICE_SETUP, ssFilters, []);
            //console.log({ ssResults: ssResults.length });
            log.debug(SS_FOB_PRICE_SETUP, { ss_length: ssResults.length, ssFilters: ssFilters });
            let resultsObj = {};
            ssResults.forEach(function (row, index) {
                let setup_id = row.id;
                let setup_country = row.getValue({ "name": "custrecord_fobprice_setup_country", "label": "Country" });
                let setup_incoterm = row.getValue({ "name": "custrecord_fobprice_setup_incoterm", "label": "Incoterm" });
                let setup_port = row.getValue({ "name": "custrecord_fobprice_setup_port", "label": "Port" });
                let setup_region = row.getValue({ "name": "custrecord_fobprice_setup_region", "label": "Region" });
                let setup_startdate = row.getValue({ "name": "custrecord_fobprice_setup_startdate", "label": "Effective Start Date" });
                let setup_enddate = row.getValue({ "name": "custrecord_fobprice_setup_enddate", "label": "Effective End Date" });
                let rate_setup_type = row.getValue({ "name": "custrecord_fobprice_rate_setup_type", "join": "CUSTRECORD_FOBPRICE_RATE_SETUP_REF", "label": "Rate Type" });
                let rate_setup_rate = row.getValue({ "name": "custrecord_fobprice_rate_setup_rate", "join": "CUSTRECORD_FOBPRICE_RATE_SETUP_REF", "label": "Rate" }) || 0;
                let rate_setup_percent = row.getValue({ "name": "custrecord_fobprice_rate_setup_percent", "join": "CUSTRECORD_FOBPRICE_RATE_SETUP_REF", "label": "Value is Percentage" });
                let rate_setup_currency = row.getValue({ "name": "custrecord_fobprice_rate_setup_currency", "join": "CUSTRECORD_FOBPRICE_RATE_SETUP_REF", "label": "Currency" });
                let enable_editing = row.getValue({ "name": "custrecord_fobprice_rate_setup_edit", "join": "CUSTRECORD_FOBPRICE_RATE_SETUP_REF", "label": "Enable Editing" });
                let fobprice_rate_per = row.getValue({ "name": "custrecordcustrecord_fobprice_rate_per", "join": "CUSTRECORD_FOBPRICE_RATE_SETUP_REF", "label": "Per Container or TON" });
                if (resultsObj[setup_id] === undefined) {
                    resultsObj[setup_id] = [];
                }
                resultsObj[setup_id].push({
                    setup_id,
                    setup_country,
                    setup_incoterm,
                    setup_port,
                    setup_region,
                    setup_startdate,
                    setup_enddate,
                    rate_setup_type,
                    rate_setup_rate,
                    rate_setup_percent,
                    rate_setup_currency,
                    enable_editing,
                    fobprice_rate_per
                });
            });
            let setup_id_arr = Object.keys(resultsObj);
            if (setup_id_arr.length > 0) {
                // return first key
                log.debug("FOB Price Setup Id " + setup_id_arr[0], resultsObj[setup_id_arr[0]]);
                return resultsObj[setup_id_arr[0]];
            }
            return [];
        }
        function AvgExchangeRate(effdate) {
            const SS_EXCHANGE_RATE = 'customsearch_ss_avg_exrate';
            let filters = [];
            let resultsObj = {};
            filters.push({
                name: 'custrecord_avg_exrate_effdate',
                operator: 'onorbefore',
                values: effdate
            });
            // filters.push({
            //     name: 'custrecord_avg_exrate_currency',
            //     operator: 'is',
            //     values: currency
            // });
            try {
                let ssResults = libCode.loadSavedSearch('customrecord_avg_exrate', SS_EXCHANGE_RATE, filters, [], null, 0, 500);
                log.debug(SS_EXCHANGE_RATE, { ss_length: ssResults.length, ssFilters: filters });
                if (ssResults.length > 0) {
                    let columns = libUtility.genMapLabelToColumns(ssResults[0].columns);
                    ssResults.forEach(function (row, index) {
                        let avg_exrate_date = row.getValue({ "name": "custrecord_avg_exrate_date", "summary": "GROUP", "label": "Entry Date" });
                        let avg_exrate_effdate = row.getValue({ "name": "custrecord_avg_exrate_effdate", "summary": "GROUP", "label": "Posting Date" });
                        let avg_exrate_currency = row.getValue({ "name": "custrecord_avg_exrate_currency", "summary": "GROUP", "label": "Currency" });
                        let avd_exrate_buying = row.getValue(columns['Buying Rate']);
                        let avg_exrate_selling = row.getValue(columns['Selling Rate']);
                        if (!!avg_exrate_currency) {
                            if (resultsObj[avg_exrate_currency] === undefined) {
                                resultsObj[avg_exrate_currency] = {
                                    date: avg_exrate_date,
                                    effdate: avg_exrate_effdate,
                                    currency: avg_exrate_currency,
                                    buying: Number(avd_exrate_buying),
                                    selling: Number(avg_exrate_selling),
                                };
                            }
                        }
                    });
                }
            }
            catch (error) {
                log.error({
                    title: SS_EXCHANGE_RATE,
                    details: error
                });
            }
            // default Thai rate is 1
            if (resultsObj['1'] === undefined) { // Thai
                resultsObj['1'] = {
                    buying: 1,
                    selling: 1
                };
            }
            return resultsObj;
        }
        function BotExchangeRate(effective_date, currencyId) {
            let ssFilters = [];
            // Effective Date
            ssFilters.push({ "name": "custrecord_thl_bot_effectivedate", "join": null, "operator": "onorbefore", "values": effective_date });
            // Currency
            ssFilters.push({ "name": "custrecord_thl_bot_currency", join: null, "operator": "is", "values": currencyId });
            // const SS_REPS_BOT_EXCHANGERATE_TABLE = 'customsearch_reps_bot_exchangerate_table';
            const SS_REPS_BOT_EXCHANGERATE_TABLE = 'customsearch_ss_bot_exchangerate_table';
            var ssResults = libCode.loadSavedSearch(null, SS_REPS_BOT_EXCHANGERATE_TABLE, ssFilters, [], null, 0, 1);
            //console.log({ ssResults: ssResults.length });
            let resultsObj = {};
            if (ssResults.length > 0) {
                let row = ssResults[0];
                let date = row.getValue({ "name": "custrecord_thl_bot_date", "label": "Date" });
                let currency = row.getValue({ "name": "custrecord_thl_bot_currency", "label": "Currency" });
                let buyingsight = row.getValue({ "name": "custrecord_thl_bot_buyingsight", "label": "Buying Rate (Sight)" });
                let buyingtransfer = row.getValue({ "name": "custrecord_thl_bot_buyingtransfer", "label": "Buying Rate (Transfer)" });
                let sellingrate = row.getValue({ "name": "custrecord_thl_bot_sellingrate", "label": "Selling Rate" });
                let midrate = row.getValue({ "name": "custrecord_thl_bot_midrate", "label": "Mid Rate" });
                let effectivedate = row.getValue({ "name": "custrecord_thl_bot_effectivedate", "label": "Effective Date" });
                if (!!currency) {
                    if (resultsObj[currency] === undefined) {
                        resultsObj[currency] = {
                            date: date,
                            effdate: effectivedate,
                            currency: currency,
                            buying: Number(buyingtransfer),
                            selling: Number(sellingrate),
                        };
                    }
                }
            }
            log.debug(SS_REPS_BOT_EXCHANGERATE_TABLE, { ss_length: ssResults.length, ssFilters: ssFilters, resultsObj });
            return resultsObj;
        }
        /**
         * Sales Export Information -->  Ex Container Calculation --> Container Index
         * @param cRecord
         * @returns
         */
        function getQtyContainers(cRecord) {
            let custbody_exp_ordertype = cRecord.getValue({ fieldId: 'custbody_exp_ordertype' });
            let custbody_total_container = cRecord.getValue({ fieldId: 'custbody_total_container' });
            if (custbody_exp_ordertype === '6') { // Custom Invoice
                return custbody_total_container || 0;
            }
            else {
                let containersIndexList = [];
                for (let i = 0; i < cRecord.getLineCount({ sublistId: 'recmachcustrecord_concal_ref_so' }); i++) {
                    let container_index = Number(cRecord.getSublistValue({ sublistId: 'recmachcustrecord_concal_ref_so', fieldId: 'custrecord_concal_container_index', line: i }));
                    if (container_index) {
                        containersIndexList.push(container_index);
                    }
                }
                containersIndexList = libUtility.removeDuplicates(containersIndexList);
                return containersIndexList.length;
            }
        }
        function getCurrencyDigit(currencyId) {
            if (!currencyId) {
                return 0;
            }
            try {
                let cRecord = record.load({ type: 'currency', id: currencyId, isDynamic: false });
                let currencyPrecision = cRecord.getValue({ fieldId: 'currencyprecision' });
                let currencyDigit = Number(currencyPrecision);
                return isNaN(currencyDigit) ? 0 : currencyDigit;
            }
            catch (error) {
                log.error({
                    title: 'getCurrencyDigit',
                    details: { currencyId, error }
                });
                return 0;
            }
        }
        /*========================================= Repositories ==============================*/
        return {
            createUIFormAndFields: createUIFormAndFields,
            createSublistFobDetail: createSublistFobDetail,
            createSublistFobPriceRate: createSublistFobPriceRate,
            AvgExchangeRate: AvgExchangeRate,
            getFobPriceLineItem: getFobPriceLineItem,
            BotExchangeRate: BotExchangeRate,
            getFOBPriceSetup: getFOBPriceSetup,
            loadFOBPriceRateType: loadFOBPriceRateType,
            getQtyContainers: getQtyContainers,
            getCurrencyDigit: getCurrencyDigit
        };
    })();
    /*========================================= Repositories ==============================*/
    /*========================================= libUtility ==============================*/
    /**
     * ฟังก์ชันสำหรับปัดค่าตัวเลขให้มีจำนวนทศนิยมตามที่กำหนด
     *
     * @param {number} value - ค่าตัวเลขที่ต้องการปัด
     * @param {number} decimals - จำนวนตำแหน่งทศนิยมที่ต้องการ (เช่น 2 = ปัด 2 ตำแหน่ง)
     * @returns {number} ค่าที่ถูกปัดแล้วตามจำนวนทศนิยมที่กำหนด
     *
     * @example
     * const result = roundTo(337318.4985932968, 0);
     * // ผลลัพธ์: 337318
     * const result2 = roundTo(337318.4985932968, 2);
     * // ผลลัพธ์: 337318.50
     */
    function roundTo(value, decimals) {
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }
    function displayHtml(data) {
        let result = '';
        if (typeof data === 'object') {
            for (const key in data) {
                if (Object.hasOwnProperty.call(data, key)) {
                    const element = data[key];
                    result += `${key} : ${element}<br>`;
                }
            }
        }
        else {
            result = data;
        }
        return result;
    }
    function HttpResponse(params, callBackFunction) {
        if (!!callBackFunction) {
            return callBackFunction(params);
        }
        try {
            return JSON.stringify(params);
        }
        catch (error) {
            return params;
        }
    }
    /**
     * กรองเฉพาะ key ที่ขึ้นต้นด้วย "custpage_"
     * @param params
     * @returns
     */
    function getFieldParams(params = {}) {
        return Object.keys(params)
            .filter(key => key.startsWith("custpage_"))
            .reduce((obj, key) => {
            obj[key] = params[key];
            return obj;
        }, {});
    }
    //@ts-ignore
    return {
        onRequest
    };
});
