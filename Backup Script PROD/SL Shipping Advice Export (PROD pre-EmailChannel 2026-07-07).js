/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 */
define(["N/format", "N/cache", "N/file", "N/search", "N/record", "N/redirect", "N/runtime", "N/ui/serverWidget", "N/email", "../../Lib/Libraries Utility", "../../Lib/Libraries Code 2.0.220622", "../../Lib/Constants", "../../Lib/LibrariesFlashNotification"], function (format, cache, file, search, record, redirect, runtime, ui, email, libUtility, libCode, libConstants, libFlashNotification) {
    // "use strict";
    // Object.defineProperty(exports, "__esModule", { value: true });
    const SHIPPING_ADVICE_STATUS = libConstants.SHIPPING_ADVICE_STATUS;
    /*
     * @author      [15/10/2025] Tanuwong <tanuwong@teibto.com>
     * @version     1.0
     * @requires - Create With TypeScript
     * Name :  SL Shipping Advice Export
     * ID : customscript_sl_shipping_advice_export
     *
     * @changes 1 Create Script
     * ref
    */
    const CS_SCRIPTID_PATH = './SL Shipping Advice Export CS.js';
    const MULTISELECT_DELIMITER = /\u0005/;
    const STEP_PAGE = {
        PAGE1_FILTER: 'PAGE_1_FILTER',
        PAGE_2_SELECT_DATA: 'PAGE_2_SELECT_DATA',
        PAGE_3_PREVIEW_DATA: 'PAGE_3_PREVIEW_DATA',
        PAGE_4_SUBMIT_DATA: 'PAGE_4_SUBMIT_DATA',
        CREATE_LOG: 'CREATE_LOG',
        VIEW_LOG: 'VIEW_LOG',
        CREATE_SESSION_LOG: 'CREATE_SESSION_LOG',
        CURRENT: 'CURRENT',
        UPDATE_SA_PAGE_1_SELECT_DATA: 'UPDATE_SA_PAGE_1_SELECT_DATA',
        UPDATE_SA_PAGE_2_SUBMIT_DATA: 'UPDATE_SA_PAGE_2_SUBMIT_DATA',
        CONFIRM_SHIPPING_ADVICE: 'CONFIRM_SHIPPING_ADVICE',
    };
    function onRequest(context) {
        // ==================== Define Default Variable
        let params = context.request.parameters;
        let step = params.step || '';
        // ============================================
        log.debug('Start step ' + step, new Date().toISOString());
        switch (step) {
            case '':
            case STEP_PAGE.PAGE1_FILTER:
                Page1_Filter(context, params);
                break;
            case STEP_PAGE.PAGE_2_SELECT_DATA:
                Page2_SelectData(context, params);
                break;
            case STEP_PAGE.PAGE_3_PREVIEW_DATA:
                Page3_PreviewData(context, params);
                break;
            case STEP_PAGE.PAGE_4_SUBMIT_DATA:
                Page4_SubmitData(context, params);
                break;
            case STEP_PAGE.VIEW_LOG:
                Page5_View_Log(context, params);
                break;
            case STEP_PAGE.UPDATE_SA_PAGE_1_SELECT_DATA:
                /**
                 * Update Shipping Advice
                 * กดปุ่ม Update มาจากหน้า Sales Order (SA)
                 */
                UpdateSAPage1_SelectData(context, params);
                break;
            case STEP_PAGE.UPDATE_SA_PAGE_2_SUBMIT_DATA:
                UpdateSAPage2_SubmitData(context, params);
                break;
            case STEP_PAGE.CONFIRM_SHIPPING_ADVICE:
                /**
                 * Confirm Shipping Advice
                 * กดปุ่ม Confirm มาจากหน้า Sales Order (SA)
                 */
                handleConfirmShippingAdvice(context, params);
                break;
            default:
                log.error({ title: '404 Page Not Found', details: { step } });
                context.response.write(JSON.stringify({ ERROR: '404 Page Not Found', step }, null, 5));
        }
        log.debug('End step ' + step, 'Remaining Usage : ' + runtime.getCurrentScript().getRemainingUsage() + ', ' + new Date().toISOString());
    }
    /*========================================= Use Case ==============================*/
    /**
     * ดึงข้อมูล Container จาก Sales Order และคำนวณจำนวน Container แต่ละ Size
     * @param {record.Record} recRecordObj - Sales Order Record Object
     * @returns {Array<{container_total: string, container_size: string}>} Array ของ container objects
     *   แต่ละ object มี container_total (จำนวน) และ container_size (ขนาด)
     */
    function getContainerInfo(recRecordObj) {
        const sublistConCalRefId = 'recmachcustrecord_concal_ref_so';
        const lineCountRef = recRecordObj.getLineCount({ sublistId: sublistConCalRefId });
        let containersIndexList = {};
        let containersSizeId = '';
        // รวบรวมข้อมูล container แต่ละ size
        for (let r = 0; r < lineCountRef; r++) {
            const container_index = recRecordObj.getSublistValue({ sublistId: sublistConCalRefId, fieldId: 'custrecord_concal_container_index', line: r });
            const container_size = recRecordObj.getSublistValue({ sublistId: sublistConCalRefId, fieldId: 'custrecord_concal_container_size', line: r });
            const container_size_text = recRecordObj.getSublistText({ sublistId: sublistConCalRefId, fieldId: 'custrecord_concal_container_size', line: r });
            if (container_index && container_size) {
                // ถ้ายังไม่มี container_size นี้ใน list ให้สร้างใหม่
                if (!containersIndexList[container_size]) {
                    containersIndexList[container_size] = {
                        container_size_text,
                        container_indexs: []
                    };
                }
                containersSizeId = container_size;
                containersIndexList[container_size].container_indexs.push(Number(container_index) || 0);
            }
        }
        let containerList = [];
        // สร้าง array ของ container objects
        for (const containerSize in containersIndexList) {
            if (!Object.hasOwn(containersIndexList, containerSize))
                continue;
            const element = containersIndexList[containerSize];
            // หา max index ของแต่ละ container size
            const maxIndexPerSize = element?.container_indexs.length > 0
                ? Math.max(...element.container_indexs)
                : 0;
            containerList.push({
                container_total: String(maxIndexPerSize),
                container_size: element.container_size_text
            });
        }
        return { containerList, containersSizeId };
    }
    function handleConfirmShippingAdvice(context, params) {
        const { request, response } = context;
        // =============================================================================
        const { rectype, recid } = params;
        if (!recid) {
            throw new Error("Please enter Shipping Advice ID.");
        }
        record.submitFields({
            type: record.Type.SALES_ORDER,
            id: recid,
            values: {
                custbody_shippingadvice_status: SHIPPING_ADVICE_STATUS.CONFIRMED,
                custbody_exp_pi_status: '1' // 1 : Confirmed Order
            },
            options: { enableSourcing: false, ignoreMandatoryFields: true }
        });
        /* ============ AUTO EMAIL (Synchronous, Non-blocking on error) ============ */
        try {
            ShippingAdviceEmailModule.sendConfirmedEmail(recid);
        }
        catch (emailError) {
            // Email failure must NOT block the Confirm action (status already updated)
            log.error({
                title: 'Send SA Confirmed Email Failed (Non-blocking)',
                details: {
                    recid: recid,
                    name: emailError && emailError.name,
                    message: emailError && emailError.message,
                    stack: emailError && emailError.stack,
                    errorString: String(emailError),
                    errorJson: (function () {
                        try {
                            return JSON.stringify(emailError, Object.getOwnPropertyNames(emailError || {}));
                        }
                        catch (e) {
                            return 'cannot stringify';
                        }
                    })()
                }
            });
        }
        /* ========================================================================= */
        // Set Flash Notification
        libFlashNotification.setNotification('shipping-advice-confirm', 'Shipping advice confirmed successfully.');
        redirect.toRecord({
            type: record.Type.SALES_ORDER,
            id: recid,
            parameters: {
            // msg: 'Shipping advice confirmed successfully.'
            }
        });
    }
    function UpdateSAPage1_SelectData(context, params) {
        const { request, response } = context;
        // =============================================================================
        // const { rectype, recid } = params;
        let paramsValueObj = getFieldParams(params);
        // let USE_SUB = runtime.isFeatureInEffect({ feature: 'SUBSIDIARIES' });
        log.debug('paramsValueObj', paramsValueObj);
        let form = ui.createForm({
            title: 'Generate Shipping Advice',
            hideNavBar: false,
        });
        let cRecord = record.load({ type: record.Type.SALES_ORDER, id: paramsValueObj.custpage_shipping_advice, isDynamic: true });
        form.addFieldGroup({ id: 'g_info', label: 'Primary Information' });
        createFieldsHiddenBody(form);
        let uiField;
        uiField = form.addField({ id: 'custpage_shipping_advice', type: 'select', label: 'Shipping Advice', source: 'transaction', container: 'g_info' }).updateDisplayType({ displayType: ui.FieldDisplayType.DISABLED });
        uiField = form.addField({ id: 'custpage_pi', type: 'select', label: 'PI', source: 'transaction', container: 'g_info' }).updateDisplayType({ displayType: ui.FieldDisplayType.DISABLED });
        uiField = form.addField({ id: 'custpage_customer', type: 'select', label: 'Customer', source: 'customer', container: 'g_info' }).updateDisplayType({ displayType: ui.FieldDisplayType.DISABLED });
        let lineCountItem = cRecord.getLineCount({ sublistId: 'item' });
        let sublistItem = form.addSublist({ id: 'sublist_item', type: ui.SublistType.LIST, label: 'Item List', tab: '' });
        sublistItem.addField({ id: 'is_select', type: ui.FieldType.CHECKBOX, label: 'Select' }).updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
        sublistItem.addField({ id: 'item', type: ui.FieldType.SELECT, label: 'item', source: 'item' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        sublistItem.addField({ id: 'quantity', type: ui.FieldType.FLOAT, label: 'quantity' }).updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
        sublistItem.addField({ id: 'quantity_old', type: ui.FieldType.FLOAT, label: 'Quantity Old' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        sublistItem.addField({ id: 'units', type: ui.FieldType.TEXT, label: 'units' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        sublistItem.addField({ id: 'lineuniquekey', type: ui.FieldType.TEXT, label: 'lineuniquekey' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        let lineIndex = 0;
        for (let i = 0; i < lineCountItem; i++) {
            cRecord.selectLine({ sublistId: 'item', line: i });
            let item = cRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
            let quantity = cRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity' });
            let units = cRecord.getCurrentSublistText({ sublistId: 'item', fieldId: 'units' });
            let itemtype = cRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'itemtype' });
            let lineuniquekey = cRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'lineuniquekey' });
            if (!['Subtotal', 'Discount'].includes(itemtype)) {
                if (item) {
                    sublistItem.setSublistValue({ id: 'item', line: lineIndex, value: item });
                }
                if (quantity) {
                    sublistItem.setSublistValue({ id: 'quantity', line: lineIndex, value: quantity });
                    sublistItem.setSublistValue({ id: 'quantity_old', line: lineIndex, value: quantity });
                }
                if (units) {
                    sublistItem.setSublistValue({ id: 'units', line: lineIndex, value: units });
                }
                if (lineuniquekey) {
                    sublistItem.setSublistValue({ id: 'lineuniquekey', line: lineIndex, value: lineuniquekey });
                }
            }
            lineIndex++;
        }
        // form.addButton({ label: 'Search', id: 'btn_search', functionName: 'goToPage("")' });
        form.addSubmitButton({ label: 'Submit' });
        form.clientScriptModulePath = CS_SCRIPTID_PATH;
        form.updateDefaultValues({
            step: STEP_PAGE.UPDATE_SA_PAGE_2_SUBMIT_DATA,
            step_current: STEP_PAGE.UPDATE_SA_PAGE_1_SELECT_DATA,
            script_id: runtime.getCurrentScript().id,
            script_deploy_id: runtime.getCurrentScript().deploymentId,
            custpage_inprogress_bar: libUtility.getLoading('System Process....'),
            ...paramsValueObj
        });
        response.writePage(form);
    }
    function UpdateSAPage2_SubmitData(context, params) {
        const { request, response } = context;
        // =============================================================================
        // const { rectype, recid } = params;
        let paramsValueObj = getFieldParams(params);
        // let USE_SUB = runtime.isFeatureInEffect({ feature: 'SUBSIDIARIES' });
        log.debug('paramsValueObj', paramsValueObj);
        let resultsItem = [];
        let lineCountItemSL = request.getLineCount({ group: 'sublist_item' });
        for (let i = 0; i < lineCountItemSL; i++) {
            let is_select = request.getSublistValue({ name: 'is_select', group: 'sublist_item', line: i });
            if (is_select === 'T') {
                let quantity = request.getSublistValue({ name: 'quantity', group: 'sublist_item', line: i });
                let lineuniquekey = request.getSublistValue({ name: 'lineuniquekey', group: 'sublist_item', line: i });
                if (quantity) {
                    resultsItem.push({
                        quantity: Number(quantity),
                        lineuniquekey: Number(lineuniquekey)
                    });
                }
            }
        }
        log.debug('resultsItem', resultsItem);
        if (resultsItem.length == 0) {
            throw new Error(`Please select at least 1 item.`);
        }
        let cRecord = record.load({ type: record.Type.SALES_ORDER, id: paramsValueObj.custpage_shipping_advice, isDynamic: true });
        for (const itemObj of resultsItem) {
            const { quantity, lineuniquekey } = itemObj;
            let findIndex = cRecord.findSublistLineWithValue({ sublistId: 'item', fieldId: 'lineuniquekey', value: lineuniquekey });
            if (findIndex !== -1) {
                cRecord.selectLine({ sublistId: 'item', line: findIndex });
                cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: quantity });
                cRecord.commitLine({ sublistId: 'item' });
            }
        }
        cRecord.save({ ignoreMandatoryFields: true });
        redirect.toRecord({
            type: record.Type.SALES_ORDER,
            id: paramsValueObj.custpage_shipping_advice,
            parameters: {
                msg: 'SL Shipping Advice Export has been updated successfully.'
            }
        });
    }
    function Page1_Filter(context, params) {
        const { request, response } = context;
        // =============================================================================
        // const { rectype, recid } = params;
        let paramsValueObj = getFieldParams(params);
        let USE_SUB = runtime.isFeatureInEffect({ feature: 'SUBSIDIARIES' });
        let form;
        form = ui.createForm({
            title: 'Generate Shipping Advice',
            hideNavBar: false,
        });
        log.debug('paramsValueObj', paramsValueObj);
        // log.debug('step = ' + params['step'], 'USE_SUB = ' + USE_SUB + ' | USER_ROLE_ID = ' + USER_ROLE_ID + ' | USER_ID = ' + USER_ID);
        /**
         * Create Fields [Primary Information Filter]
         */
        createFieldsBody(form, ui.FieldDisplayType.ENTRY);
        // form.addButton({ label: 'Search', id: 'btn_search', functionName: 'goToPage("")' });
        form.addSubmitButton({ label: 'Search' });
        form.clientScriptModulePath = CS_SCRIPTID_PATH;
        form.updateDefaultValues({
            step: STEP_PAGE.PAGE_2_SELECT_DATA,
            step_current: STEP_PAGE.PAGE1_FILTER,
            script_id: runtime.getCurrentScript().id,
            script_deploy_id: runtime.getCurrentScript().deploymentId,
            custpage_inprogress_bar: libUtility.getLoading('System Process....'),
            ...paramsValueObj
        });
        response.writePage(form);
    }
    function Page2_SelectData(context, params) {
        const { request, response } = context;
        // =============================================================================
        // const { rectype, recid } = params;
        let paramsValueObj = getFieldParams(params);
        // let USE_SUB = runtime.isFeatureInEffect({ feature: 'SUBSIDIARIES' });
        log.debug('paramsValueObj', paramsValueObj);
        // log.debug('step = ' + params['step'], 'USE_SUB = ' + USE_SUB + ' | USER_ROLE_ID = ' + USER_ROLE_ID + ' | USER_ID = ' + USER_ID);
        let form;
        form = ui.createForm({
            title: 'Generate Shipping Advice',
            hideNavBar: false,
        });
        // log.debug('paramsValueObj', paramsValueObj);
        // log.debug('step = ' + params['step'], 'USE_SUB = ' + USE_SUB + ' | USER_ROLE_ID = ' + USER_ROLE_ID + ' | USER_ID = ' + USER_ID);
        /**
         * Create Fields [Primary Information Filter]
         */
        createFieldsBody(form, ui.FieldDisplayType.ENTRY);
        var sublistSsPiForGenSaMain = form.addSublist({ id: 'outstanding_list', type: ui.SublistType.LIST, label: 'Outstanding PI', tab: '' });
        sublistSsPiForGenSaMain.addField({ id: 'is_select', type: ui.FieldType.RADIO, label: 'Select' }).updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
        sublistSsPiForGenSaMain.addField({ id: 'tranid', type: ui.FieldType.TEXT, label: 'PI No.' });
        sublistSsPiForGenSaMain.addField({ id: 'pi_internalid', type: ui.FieldType.TEXT, label: 'Pi Internalid' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        sublistSsPiForGenSaMain.addField({ id: 'trandate', type: ui.FieldType.DATE, label: 'PI Date' });
        sublistSsPiForGenSaMain.addField({ id: 'etd_date', type: ui.FieldType.DATE, label: 'ETD Date' });
        sublistSsPiForGenSaMain.addField({ id: 'currency', type: ui.FieldType.SELECT, label: 'Currency', source: 'currency' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        sublistSsPiForGenSaMain.addField({ id: 'custbody_incoterms', type: ui.FieldType.SELECT, source: 'customrecord_customer_incoterms', label: 'Incoterms' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        sublistSsPiForGenSaMain.addField({ id: 'ship_to_country', type: ui.FieldType.SELECT, label: 'Ship to Country', source: 'customrecord_cseg_cust_country' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        // ################################################################################################
        // ===== Create Sublist - Outstanding PI
        // ################################################################################################
        let resultsPiForGenSaMain = getPiForGenerateShippingAdvice(paramsValueObj);
        if (resultsPiForGenSaMain.length > 0) {
            resultsPiForGenSaMain.forEach(function (row, index) {
                const { pi_internalid, tranid, trandate, etd_date, ship_to_country, custbody_incoterms, currency } = row;
                if (!!pi_internalid) {
                    sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'pi_internalid', value: pi_internalid });
                }
                if (!!tranid) {
                    sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'tranid', value: tranid });
                }
                if (!!trandate) {
                    sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'trandate', value: trandate });
                }
                if (!!etd_date) {
                    sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'etd_date', value: etd_date });
                }
                if (!!ship_to_country) {
                    sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'ship_to_country', value: ship_to_country });
                }
                if (!!custbody_incoterms) {
                    sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'custbody_incoterms', value: custbody_incoterms });
                }
                if (!!currency) {
                    sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'currency', value: currency });
                }
            });
        }
        form.addButton({ label: 'Search', id: 'btn_search', functionName: 'goToPage("' + STEP_PAGE.PAGE1_FILTER + '", { step : "' + STEP_PAGE.PAGE_2_SELECT_DATA + '" })' });
        form.addButton({ label: 'Back', id: 'btn_back', functionName: 'goToPage("")' });
        form.addSubmitButton({ label: 'Next' });
        form.clientScriptModulePath = CS_SCRIPTID_PATH;
        form.updateDefaultValues({
            step: STEP_PAGE.PAGE_3_PREVIEW_DATA,
            step_current: STEP_PAGE.PAGE_2_SELECT_DATA,
            script_id: runtime.getCurrentScript().id,
            script_deploy_id: runtime.getCurrentScript().deploymentId,
            custpage_inprogress_bar: libUtility.getLoading('System Process....'),
            ...paramsValueObj
        });
        response.writePage(form);
    }
    function Page3_PreviewData(context, params) {
        const { request, response } = context;
        let paramsValueObj = getFieldParams(params);
        // =============================================================================
        log.debug('paramsValueObj', paramsValueObj);
        // log.debug('Results PI INTERNAL ID', resultsPiInternalId);
        if (!paramsValueObj.custpage_pi_no) {
            throw new Error("Please select at least 1 item.");
        }
        let pi_internalid = paramsValueObj.custpage_pi_no;
        let recRecordObj = record.load({ type: record.Type.SALES_ORDER, id: pi_internalid, isDynamic: true });
        let subsidiaryId = recRecordObj.getValue({ fieldId: 'subsidiary' });
        paramsValueObj.custpage_customer = recRecordObj.getValue({ fieldId: 'entity' });
        paramsValueObj.custpage_subsidiary = subsidiaryId;
        let customerAddress = getCustomerAddressObject(paramsValueObj.custpage_customer);
        let CUSTOMER_ADDRESS = customerAddress['CUSTOMER_ADDRESS'] || [];
        let CUSTOMER_ADDRESS_MAP = customerAddress['CUSTOMER_ADDRESS_MAP'] || {};
        let ADDRESS_MAP = customerAddress['ADDRESS_MAP'] || {};
        let resultsLocationLoadingPlace = loadLocationLoadingPlace();
        let userObj = runtime.getCurrentUser();
        // ################################################################################################
        // Default Field Value
        // ################################################################################################
        let defaultFieldValue = {
            custpage_shipaddresslist: '',
            custpage_shipaddress: '',
            custpage_billaddresslist: '',
            custpage_billaddress: '',
            custbody_ex_oh_name: userObj.id,
            custbody_ex_consignee_name: '', // Consignee Name
            custbody_ex_consignee_address: '', // Consignee Address
            custbody_ex_consignee_tel: '', // Consignee tel
            custbody_ex_consignee_email: '', // Consignee email
            custbody_ex_notify_address1: '', // Notify Address 1
            custbody_ex_notify_name1: '', // Notify Name 1
            custbody_ex_notify_tel1: '', // Notify tel 1
            custbody_ex_notify_email1: '', // Notify email 1
            custpage_freight_term: '', // Freight Term
            custbody_ex_shipper_name: '', // Shipper Name ให้ defualt DA 1991,
            custbody_ship_from_country: '',
            custbody_ship_to_country: '',
            custbody_port_text: '',
            custrecord_ex_loading_place: '',
            custbody_insurance: '',
            custbody_container_size: '',
            custbody_total_container_text: '',
            custbody_total_container: 0,
            custbody_shipdate: '',
            custbody_exp_request__etd_date: '',
            custbody_shipping_mask: '',
        };
        // ดึงข้อมูล Container
        const { containerList, containersSizeId } = getContainerInfo(recRecordObj);
        // แปลง array เป็น text และหา max container index
        const containerText = containerList.map(c => `${c.container_total}x${c.container_size}`).join(', ');
        const maxContainerIndex = containerList.length > 0
            ? Math.max(...containerList.map(c => Number(c.container_total) || 0))
            : 0;
        defaultFieldValue.custbody_total_container_text = (containerList.length === 0) ? '' : libUtility.jsonStringify(containerList);
        defaultFieldValue.custbody_container_size = containersSizeId;
        defaultFieldValue.custbody_total_container = maxContainerIndex;
        let custbody_incoterms = recRecordObj.getValue({ fieldId: 'custbody_incoterms' });
        let custbody_incoterms_text = recRecordObj.getText({ fieldId: 'custbody_incoterms' });
        let shippingaddress_key = recRecordObj.getValue({ fieldId: 'shippingaddress_key' });
        let billingaddress_key = recRecordObj.getValue({ fieldId: 'billingaddress_key' });
        let custbody_ship_from_country = recRecordObj.getValue({ fieldId: 'custbody_ship_from_country' });
        let custbody_ship_to_country = recRecordObj.getValue({ fieldId: 'custbody_ship_to_country' });
        let custbody_port_text = recRecordObj.getValue({ fieldId: 'custbody_port' });
        let custbody_location_loading = recRecordObj.getValue({ fieldId: 'custbody_location_loading' });
        defaultFieldValue.custbody_port_text = custbody_port_text;
        defaultFieldValue.custbody_shipping_mask = recRecordObj.getValue({ fieldId: 'custbody_shipping_mask' }) || '';
        defaultFieldValue.custbody_shipdate = recRecordObj.getText({ fieldId: 'shipdate' });
        defaultFieldValue.custbody_exp_request__etd_date = recRecordObj.getValue({ fieldId: 'custbody_exp_request__etd_date' });
        defaultFieldValue.custbody_ship_from_country = custbody_ship_from_country;
        defaultFieldValue.custbody_ship_to_country = custbody_ship_to_country;
        defaultFieldValue.custbody_port_text = custbody_port_text;
        if (subsidiaryId == '2') { // Double A (1991) PLC
            defaultFieldValue.custbody_ex_shipper_name = '1';
        }
        else if (subsidiaryId == '4') { // 4 D.A.Packaging Co., Ltd.
            defaultFieldValue.custbody_ex_shipper_name = '2';
        }
        /**
         * Customer Incoterms
         */
        if (custbody_incoterms) {
            let inCotermsData = libUtility.getLookupFields('customrecord_customer_incoterms', custbody_incoterms, ['custrecord_ic_insurance']);
            if (inCotermsData) {
                defaultFieldValue.custbody_insurance = inCotermsData['custrecord_ic_insurance'];
            }
        }
        let custcol_ex_location_loading = '';
        let LINE_COUNT = recRecordObj.getLineCount({ sublistId: 'item' });
        for (let i = 0; i < LINE_COUNT; i++) {
            let ex_location_loading = recRecordObj.getSublistValue({ sublistId: 'item', fieldId: 'custcol_ex_location_loading', line: i });
            if (!custcol_ex_location_loading && !!ex_location_loading) {
                custcol_ex_location_loading = ex_location_loading;
            }
        }
        defaultFieldValue.custrecord_ex_loading_place = custcol_ex_location_loading;
        /**
            - Shipping Advice Field Consignee, Notify ให้ Default มาจาก Shippng Address ของ Customer
         */
        let custpage_billaddresslist = ADDRESS_MAP[billingaddress_key] || '';
        if (custpage_billaddresslist) {
            defaultFieldValue.custpage_billaddresslist = custpage_billaddresslist;
            let customerBillAddressObj = CUSTOMER_ADDRESS_MAP[custpage_billaddresslist];
            if (customerBillAddressObj) {
                defaultFieldValue.custpage_billaddress = customerBillAddressObj['addressbookaddress_text'] || '';
            }
        }
        let customer_shippin_address = ADDRESS_MAP[shippingaddress_key];
        if (customer_shippin_address) {
            defaultFieldValue.custpage_shipaddresslist = customer_shippin_address;
            let customerShippinAddressObj = CUSTOMER_ADDRESS_MAP[customer_shippin_address];
            if (customerShippinAddressObj) {
                defaultFieldValue.custpage_shipaddress = customerShippinAddressObj['addressbookaddress_text'] || '';
                defaultFieldValue.custbody_ex_consignee_name = (customerShippinAddressObj['custrecord_consignee_name'] || '').toUpperCase();
                defaultFieldValue.custbody_ex_consignee_address = (customerShippinAddressObj['custrecord_consignee_addr'] || '').toUpperCase();
                defaultFieldValue.custbody_ex_consignee_tel = (customerShippinAddressObj['custrecord_consignee_tel'] || '').toUpperCase();
                defaultFieldValue.custbody_ex_consignee_email = (customerShippinAddressObj['custrecord_consignee_email'] || '').toUpperCase();
                defaultFieldValue.custbody_ex_notify_address1 = (customerShippinAddressObj['custrecord_notifyparty_addr'] || '').toUpperCase();
                defaultFieldValue.custbody_ex_notify_name1 = (customerShippinAddressObj['custrecord_notifyparty_name'] || '').toUpperCase();
                defaultFieldValue.custbody_ex_notify_tel1 = (customerShippinAddressObj['custrecord_notifyparty_tel'] || '').toUpperCase();
                defaultFieldValue.custbody_ex_notify_email1 = (customerShippinAddressObj['custrecord_consignee_email'] || '').toUpperCase();
            }
        }
        if (custbody_incoterms_text) {
            /**
                - Shipping Advice Field Freight Term ให้ Default จาก Incoterms
                    "ถ้าเป็น FOB = Freight Collect
                    ถ้าเป็น Exw = Blank
                    ถ้าเป็น Incoterms อื่นๆ Freight Prepaid"
             */
            let freight_term = '';
            switch (custbody_incoterms_text) {
                case 'FOB':
                    freight_term = 'Freight Collect';
                    break;
                case 'Exw':
                    freight_term = '';
                    break;
                default:
                    freight_term = 'Freight Prepaid';
                    break;
            }
            defaultFieldValue.custpage_freight_term = freight_term;
        }
        // let USE_SUB = runtime.isFeatureInEffect({ feature: 'SUBSIDIARIES' });
        // log.debug('step = ' + params['step'], 'USE_SUB = ' + USE_SUB + ' | USER_ROLE_ID = ' + USER_ROLE_ID + ' | USER_ID = ' + USER_ID);
        const customForm = new ClassCustomForm({
            title: 'Generate Shipping Advice',
            hideNavBar: false,
        });
        let form = customForm.getForm();
        // // Attachment
        // customForm.addField({ id: 'custbody_ex_attachment', type: ui.FieldType.FILE, label: 'Attachment', source: null, container: '' })
        //     .updateBreakType({ breakType: ui.FieldBreakType.STARTROW })
        //     .updateLayoutType({ layoutType: ui.FieldLayoutType.STARTROW });
        /**
         * Create Fields [Primary Information Filter]
         */
        createFieldsBody(form, ui.FieldDisplayType.DISABLED);
        form.addFieldGroup({ id: 'container', label: 'Container Info' });
        // Container Info
        form.addField({ id: 'custbody_total_container_text', type: ui.FieldType.TEXTAREA, label: 'Container', container: 'container' }).updateDisplayType({ displayType: ui.FieldDisplayType.DISABLED });
        // form.addField({ id: 'custbody_container_size', type: ui.FieldType.SELECT, label: 'Container Size', source: 'customrecord_exp_containerssize', container: 'container' });
        // uiField.updateDisplayType({ displayType: ui.FieldDisplayType.DISABLED });
        form.addField({ id: 'custbody_total_container', type: ui.FieldType.INTEGER, label: 'Quantity of Container', source: null, container: 'container' });
        form.addField({ id: 'custbody_shipdate', type: ui.FieldType.DATE, label: 'Ship Date', source: null, container: 'container' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        form.addField({ id: 'custbody_exp_request__etd_date', type: ui.FieldType.DATE, label: 'Request ETD Date', source: null, container: 'container' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        // ################################################################################################
        // Create Tabs
        // Create Fields Group
        // ################################################################################################
        form.addTab({ id: 'custtab_proforma_invoice', label: 'Proforma Invoice Details' });
        form.addTab({ id: 'custtab_item', label: 'Item Detail' });
        form.addTab({ id: 'custtab_bl_instruction', label: 'BL Instruction' }); // Shipping Advice Tab Shipping Detail เป็น BL Instruction
        form.addTab({ id: 'custtab_booking', label: 'Booking Info.' });
        form.addTab({ id: 'custtab_container_plan', label: 'Container Plan' });
        /**
         *
         * Tab : Shipping Detail
         * Add Fields
         *
         */
        {
            form.addFieldGroup({ id: 'custgroup_shipping_address', label: 'Shipping Address', tab: 'custtab_bl_instruction' }).isSingleColumn = false;
            form.addFieldGroup({ id: 'custgroup_shipping', label: 'Shipping Information', tab: 'custtab_bl_instruction' }).isSingleColumn = false;
            form.addFieldGroup({ id: 'custgroup_bl_instruction', label: 'BL Instruction', tab: 'custtab_bl_instruction' }).isSingleColumn = false;
            /**
             * Shipping Address
             */
            let fieldShipAddressList = customForm.addField({ id: 'custpage_shipaddresslist', type: 'select', label: 'Ship To Select', source: null, container: 'custgroup_shipping_address' });
            let fieldShipAddress = customForm.addField({ id: 'custpage_shipaddress', type: 'textarea', label: 'Ship To Address', source: null, container: 'custgroup_shipping_address' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            let fieldBillAddressList = customForm.addField({ id: 'custpage_billaddresslist', type: 'select', label: 'Bill To Select', source: null, container: 'custgroup_shipping_address' });
            fieldBillAddressList.updateBreakType({ breakType: ui.FieldBreakType.STARTCOL });
            customForm.addField({ id: 'custpage_billaddress', type: 'textarea', label: 'Bill To Address', source: null, container: 'custgroup_shipping_address' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            /**
             * Shipping Information
             */
            //Shipform Country ดึงจาก SO เป็น segment
            var column = [];
            column.push('internalid');
            column.push({ name: 'name', sort: search.Sort.ASC });
            var filter = [];
            filter.push({ name: 'isinactive', operator: 'is', values: 'F' });
            var ss_country = libCode.loadSavedSearch('customrecord_cseg_cust_country', null, filter, column);
            var ship_field_from = customForm.addField({ id: 'custbody_ship_from_country', type: ui.FieldType.SELECT, label: 'Ship from Country', source: null, container: 'custgroup_shipping' }); //custom Record
            //Shipto Country ดึงจาก SO เป็น segment
            var ship_field_to = customForm.addField({ id: 'custbody_ship_to_country', type: ui.FieldType.SELECT, label: 'Ship to Country', source: null, container: 'custgroup_shipping' }); //custom Record
            ship_field_from.addSelectOption({ value: '', text: '' });
            ship_field_to.addSelectOption({ value: '', text: '' });
            for (var r = 0; r < ss_country.length; r++) {
                ship_field_from.addSelectOption({ value: ss_country[r].getValue({ name: 'internalid' }), text: ss_country[r].getValue({ name: 'name' }) });
                ship_field_to.addSelectOption({ value: ss_country[r].getValue({ name: 'internalid' }), text: ss_country[r].getValue({ name: 'name' }) });
            }
            if (pi_internalid) {
                // var so_data = search.lookupFields({
                //     type: 'salesorder',
                //     id: pi_internalid,
                //     columns: ['custbody_ship_from_country', 'custbody_ship_to_country', 'custbody_port']
                // });
                customForm.addField({ id: 'custbody_port_text', type: ui.FieldType.TEXT, label: 'Port Text', source: null, container: 'custgroup_shipping' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
                // form.updateDefaultValues({
                //     custbody_ship_from_country: so_data['custbody_ship_from_country']?.[0]?.value || '',
                //     custbody_ship_to_country: so_data['custbody_ship_to_country']?.[0]?.value || '',
                //     custbody_port_text: so_data['custbody_port']?.[0]?.value || '',
                // });
            }
            customForm.addField({ id: 'custpage_port_of_loading', type: ui.FieldType.SELECT, label: 'Port', source: null, container: 'custgroup_shipping' }); //custom Record
            //customForm.addField({ id: 'custpage_port_of_country', type: ui.FieldType.SELECT, label: 'Port of Country', source: null, container: 'custgroup_shipping' });//segment
            //customForm.addField({ id: 'custpage_port_of_destination', type: ui.FieldType.SELECT, label: 'Port of Destination', source: null, container: 'custgroup_shipping');//
            //customForm.addField({ id: 'custpage_destination_country', type: ui.FieldType.SELECT, label: 'Destination Country', source: null, container: 'custgroup_shipping' });
            //customForm.addField({ id: 'custpage_destination_in_transit_to_country', type: ui.FieldType.SELECT, label: 'Destination(In transit to Country)', source: null, container: 'custgroup_shipping' });
            //customForm.addField({ id: 'custbody_inv_final_destination', type: ui.FieldType.SELECT, label: 'Final Destination', source: 'customrecord_port', container: 'custgroup_shipping' });
            //customForm.addField({ id: 'custbody_ex_ata_date', type: ui.FieldType.DATE, label: 'ATA Date', source: null, container: 'custgroup_shipping' });
            // customForm.addField({ id: 'custbody_bl_date', type: ui.FieldType.DATE, label: 'BL Date', source: null, container: 'custgroup_shipping' });
            customForm.addField({ id: 'custbody_ex_lc_no', type: ui.FieldType.TEXT, label: 'LC No', source: null, container: 'custgroup_shipping' });
            customForm.addField({ id: 'custbody_ex_latest_shipment', type: ui.FieldType.DATE, label: 'Latest Shipment', source: null, container: 'custgroup_shipping' });
            customForm.addField({ id: 'custbody_expiry_date', type: ui.FieldType.DATE, label: 'Expiry Date', source: null, container: 'custgroup_shipping' });
            customForm.addField({ id: 'custbody_shipping_mask', type: ui.FieldType.TEXTAREA, label: 'Shipping Mark', source: null, container: 'custgroup_shipping' });
            /**
             * BL Instruction
             */
            // Shipper Name
            customForm.addField({ id: 'custbody_ex_shipper_name', type: ui.FieldType.SELECT, label: 'Shipper Name', source: 'customlist_ex_shipper_name', container: 'custgroup_bl_instruction' }).isMandatory = true;
            // OH Name
            customForm.addField({ id: 'custbody_ex_oh_name', type: ui.FieldType.SELECT, label: 'OH Name', source: 'employee', container: 'custgroup_bl_instruction' }).isMandatory = true;
            // OH Tel
            // customForm.addField({ id: 'custbody_ex_oh_tel', type: ui.FieldType.TEXT, label: 'OH Phone', source: null, container: 'custgroup_bl_instruction' });
            // Freight Name
            customForm.addField({ id: 'custbody_ex_freight_name', type: ui.FieldType.SELECT, label: 'Freight Name', source: 'customlist_ex_freight_team', container: 'custgroup_bl_instruction' }).isMandatory = true;
            // Insurance
            customForm.addField({ id: 'custbody_insurance', type: ui.FieldType.SELECT, label: 'Insurance', source: 'customlist_ex_insurnace', container: 'custgroup_bl_instruction' }).isMandatory = true;
            // DTHC
            // customForm.addField({ id: 'custbody_dthc', type: ui.FieldType.TEXT, label: 'DTHC', source: '', container: 'custgroup_bl_instruction' });
            // Freight Tel.
            // customForm.addField({ id: 'custbody_ex_freight_tel', type: ui.FieldType.TEXT, label: 'Freight Tel.', source: null, container: 'custgroup_bl_instruction' });
            // Special Note
            customForm.addField({ id: 'custbody_inv_special_note', type: ui.FieldType.TEXTAREA, label: 'Special Note', source: null, container: 'custgroup_bl_instruction' });
            // Consignee Name
            customForm.addField({ id: 'custbody_ex_consignee_name', type: ui.FieldType.TEXT, label: 'Consignee Name', source: null, container: 'custgroup_bl_instruction' })
                .updateBreakType({ breakType: ui.FieldBreakType.STARTCOL });
            // Consignee Address
            customForm.addField({ id: 'custbody_ex_consignee_address', type: ui.FieldType.TEXT, label: 'Consignee Address', source: null, container: 'custgroup_bl_instruction' });
            // Consignee Tel
            customForm.addField({ id: 'custbody_ex_consignee_tel', type: ui.FieldType.TEXT, label: 'Consignee Tel', source: null, container: 'custgroup_bl_instruction' });
            // Consignee Fax
            customForm.addField({ id: 'custbody_ex_consignee_fax', type: ui.FieldType.TEXT, label: 'Consignee Fax', source: null, container: 'custgroup_bl_instruction' });
            // Consignee Email
            customForm.addField({ id: 'custbody_ex_consignee_email', type: ui.FieldType.TEXT, label: 'Consignee Email', source: null, container: 'custgroup_bl_instruction' });
            // Notify Name1
            customForm.addField({ id: 'custbody_ex_notify_name1', type: ui.FieldType.TEXT, label: 'Notify Name 1', source: null, container: 'custgroup_bl_instruction' })
                .updateBreakType({ breakType: ui.FieldBreakType.STARTCOL });
            ;
            // Notify Address1
            customForm.addField({ id: 'custbody_ex_notify_address1', type: ui.FieldType.TEXT, label: 'Notify Address 1', source: null, container: 'custgroup_bl_instruction' });
            // Notify Tel 1
            customForm.addField({ id: 'custbody_ex_notify_tel1', type: ui.FieldType.TEXT, label: 'Notify Tel 1', source: null, container: 'custgroup_bl_instruction' });
            // Notify Fax 1
            customForm.addField({ id: 'custbody_ex_notify_fax1', type: ui.FieldType.TEXT, label: 'Notify Fax 1', source: null, container: 'custgroup_bl_instruction' });
            // Notify Email 1
            customForm.addField({ id: 'custbody_ex_notify_email1', type: ui.FieldType.TEXT, label: 'Notify Email 1', source: null, container: 'custgroup_bl_instruction' });
            // Notify Name2
            customForm.addField({ id: 'custbody_ex_notify_name2', type: ui.FieldType.TEXT, label: 'Notify Name 2', source: null, container: 'custgroup_bl_instruction' })
                .updateBreakType({ breakType: ui.FieldBreakType.STARTCOL });
            ;
            // Notify Address2
            customForm.addField({ id: 'custbody_ex_notify_address2', type: ui.FieldType.TEXT, label: 'Notify Address 2', source: null, container: 'custgroup_bl_instruction' });
            // Notify Tel 2
            customForm.addField({ id: 'custbody_ex_notify_tel2', type: ui.FieldType.TEXT, label: 'Notify Phone 2', source: null, container: 'custgroup_bl_instruction' });
            // Notify Fax 2
            customForm.addField({ id: 'custbody_ex_notify_fax2', type: ui.FieldType.TEXT, label: 'Notify Fax 2', source: null, container: 'custgroup_bl_instruction' });
            // Notify Email 2
            customForm.addField({ id: 'custbody_ex_notify_email2', type: ui.FieldType.TEXT, label: 'Notify Email 2', source: null, container: 'custgroup_bl_instruction' });
            fieldShipAddressList.addSelectOption({ value: '', text: '' });
            fieldBillAddressList.addSelectOption({ value: '', text: '' });
            for (var n in CUSTOMER_ADDRESS) {
                var value = CUSTOMER_ADDRESS[n]['id'];
                var text = CUSTOMER_ADDRESS[n]['label'];
                fieldShipAddressList.addSelectOption({ value: value, text: text });
                fieldBillAddressList.addSelectOption({ value: value, text: text });
            }
        }
        /**
         *
         * Tab : Booking Info.
         * Add Fields
         *
         */
        {
            form.addFieldGroup({ id: 'custgroup_booking_information', label: 'Booking Information', tab: 'custtab_booking' }).isSingleColumn = false;
            form.addFieldGroup({ id: 'custgroup_booking_attachment', label: 'Booking Attachment', tab: 'custtab_booking' }).isSingleColumn = true;
            // Booking No.
            customForm.addField({ id: 'custbody_ex_booking_no', type: ui.FieldType.TEXT, label: 'Booking No.', source: null, container: 'custgroup_booking_information' }).isMandatory = true;
            // Freight Term
            customForm.addField({ id: 'custpage_freight_term', type: ui.FieldType.TEXT, label: 'Freight Term', source: null, container: 'custgroup_booking_information' }).isMandatory = true;
            // Shipping Advice Shippng Agent เปลี่ยนชื่อเป็น Shippng Agent/Freight Forwarder
            // Shipping Advice ย้าย Shipping Agent, Feeder Vessel Name, Mother Vessel Name, Shipping Line,  มาที่ Booking
            customForm.addField({ id: 'custbody_ex_shipping_gent', type: ui.FieldType.SELECT, label: 'Shipping Agent/Freight Forwarder', source: 'customlist_ex_shipping_agent', container: 'custgroup_booking_information' }).isMandatory = true;
            customForm.addField({ id: 'custbody_ex_shipping_line', type: ui.FieldType.SELECT, label: 'Shipping Line/Carrier', source: 'customrecord_ex_shipping_line', container: 'custgroup_booking_information' }).isMandatory = true;
            let packingField = customForm.addField({ id: 'custbody_packing', type: ui.FieldType.SELECT, label: 'Packing', source: 'customlist_ex_packing', container: 'custgroup_booking_information' });
            packingField.defaultValue = 1;
            packingField.isMandatory = true;
            // Booking Description
            // customForm.addField({ id: 'custrecord_bki_bookingdescription', type: ui.FieldType.TEXTAREA, label: 'Booking Description', source: null, container: 'custgroup_booking_information' });
            customForm.addField({ id: 'custbody_ex_feedervesselname', type: ui.FieldType.TEXT, label: 'Feeder Vessel Name', source: null, container: 'custgroup_booking_information' }).isMandatory = true;
            customForm.addField({ id: 'custbody_ex_mothervesselname', type: ui.FieldType.TEXT, label: 'Mother Vessel Name', source: null, container: 'custgroup_booking_information' }).isMandatory = true;
            customForm.addField({ id: 'shipdate', type: ui.FieldType.DATE, label: 'ETD Date', source: null, container: 'custgroup_booking_information' }).isMandatory = true;
            customForm.addField({ id: 'custbody_ex_eta_date', type: ui.FieldType.DATE, label: 'ETA Date', source: null, container: 'custgroup_booking_information' });
            /**
             * Booking Attachment
             */
            customForm.addField({ id: 'custbody_booking_confirmation_url', type: ui.FieldType.URL, label: 'Booking Confirmation Attachment', source: null, container: 'custgroup_booking_attachment' });
            customForm.addField({ id: 'custbody_ero_attachment', type: ui.FieldType.URL, label: 'Attachment ERO Attachment', source: null, container: 'custgroup_booking_attachment' });
            customForm.addField({ id: 'custbody_other_attachment', type: ui.FieldType.URL, label: 'Attachment Other Attachment', source: null, container: 'custgroup_booking_attachment' });
        }
        /**
         *
         * Tab : Container Plan
         * Add Fields
         *
         */
        {
            form.addFieldGroup({ id: 'custgroup_container_yard', label: 'Container Yard (CY)', tab: 'custtab_container_plan' }).isSingleColumn = false;
            form.addFieldGroup({ id: 'custgroup_container_return', label: 'Return (RTN)', tab: 'custtab_container_plan' }).isSingleColumn = false;
            // Container Yard (CY)
            customForm.addField({ id: 'custrecord_ex_pickup_place', type: ui.FieldType.SELECT, label: 'Pickup Place', source: 'customlist_pickup_place', container: 'custgroup_container_yard' });
            customForm.addField({ id: 'custrecord_ex_pickup_date', type: ui.FieldType.DATE, label: 'Pickup Date', source: null, container: 'custgroup_container_yard' });
            customForm.addField({ id: 'custrecord_ex_pickup_contact', type: ui.FieldType.TEXT, label: 'Pickup Contact Name/Tel', source: null, container: 'custgroup_container_yard' });
            // customForm.addField({ id: 'custrecord_ex_pickup_contact_tel', type: ui.FieldType.TEXT, label: 'Pickup Contact Name/Tel', source: null, container: 'custgroup_container_yard' });
            let fieldLocationPlace = customForm.addField({ id: 'custrecord_ex_loading_place', type: ui.FieldType.SELECT, label: 'Loading Place', source: null, container: 'custgroup_container_yard' });
            fieldLocationPlace.addSelectOption({ value: '', text: '' });
            for (var n in resultsLocationLoadingPlace) {
                var value = resultsLocationLoadingPlace[n]['internalid'];
                var text = resultsLocationLoadingPlace[n]['name'];
                if (value && text) {
                    fieldLocationPlace.addSelectOption({ value: value, text: text });
                }
            }
            customForm.addField({ id: 'custrecord_ex_special_loading', type: ui.FieldType.TEXTAREA, label: 'Special Loading', source: null, container: 'custgroup_container_yard' });
            customForm.addField({ id: 'custrecord_ex_return_place', type: ui.FieldType.SELECT, label: 'Return Place', source: 'customlist_ex_return_place', container: 'custgroup_container_return' });
            customForm.addField({ id: 'custrecord_ex_return_contact', type: ui.FieldType.TEXT, label: 'Return Contact Name/Tel', source: null, container: 'custgroup_container_return' });
            // customForm.addField({ id: 'custrecord_return_contact_tel', type: ui.FieldType.TEXT, label: 'Return Contact Tel', source: null, container: 'custgroup_container_return' });
            customForm.addField({ id: 'custrecord_ex_first_return_date', type: ui.FieldType.DATE, label: 'First Return Date', source: null, container: 'custgroup_container_return' });
            customForm.addField({ id: 'custrecord_ex_closing_date', type: ui.FieldType.DATE, label: 'Closing Date', source: null, container: 'custgroup_container_return' }).isMandatory = true;
            customForm.addField({ id: 'custrecord_ex_closing_time', type: ui.FieldType.TEXT, label: 'Closing Time (HH:MM)', source: null, container: 'custgroup_container_return' }).isMandatory = true;
            customForm.addField({ id: 'custrecord_ex_vgmcutoff_date', type: ui.FieldType.DATE, label: 'VGM Cut-Off Date', source: null, container: 'custgroup_container_return' }).isMandatory = true;
            customForm.addField({ id: 'custrecord_ex_vgmcutoff_time', type: ui.FieldType.TEXT, label: 'VGM Cut-Off Time (HH:MM)', source: null, container: 'custgroup_container_return' }).isMandatory = true;
        }
        // ################################################################################################
        // ===== Create Sublist
        // ################################################################################################
        var sublistSsPiForGenSaMain = form.addSublist({ id: 'proforma_invoice_details', type: ui.SublistType.LIST, label: 'Proforma Invoice Details', tab: 'custtab_proforma_invoice' });
        // sublistSsPiForGenSaMain.addField({ id: 'is_select', type: ui.FieldType.CHECKBOX, label: 'Select' }).updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
        sublistSsPiForGenSaMain.addField({ id: 'pi_internal_id', type: ui.FieldType.TEXT, label: 'PI No.' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        sublistSsPiForGenSaMain.addField({ id: 'tranid', type: ui.FieldType.TEXT, label: 'PI No.' });
        sublistSsPiForGenSaMain.addField({ id: 'trandate', type: ui.FieldType.DATE, label: 'PI Date' });
        sublistSsPiForGenSaMain.addField({ id: 'etd_date', type: ui.FieldType.DATE, label: 'ETD Date' });
        sublistSsPiForGenSaMain.addField({ id: 'ship_to_country', type: ui.FieldType.SELECT, label: 'Ship to Country', source: 'customrecord_cseg_cust_country' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        sublistSsPiForGenSaMain.addField({ id: 'custbody_incoterms', type: ui.FieldType.SELECT, source: 'customrecord_customer_incoterms', label: 'Incoterms' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        sublistSsPiForGenSaMain.addField({ id: 'currency', type: ui.FieldType.SELECT, label: 'Currency', source: 'currency' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        var sublistItemDetail = form.addSublist({ id: 'item_detail', type: ui.SublistType.LIST, label: 'Item Detail', tab: 'custtab_item' });
        sublistItemDetail.addMarkAllButtons();
        sublistItemDetail.addField({ id: 'is_select', type: ui.FieldType.CHECKBOX, label: 'Select' }).updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
        sublistItemDetail.addField({ id: 'pi_no', type: ui.FieldType.TEXT, label: 'Proforma Invoice No. ' });
        sublistItemDetail.addField({ id: 'pi_date', type: ui.FieldType.DATE, label: 'Date' });
        sublistItemDetail.addField({ id: 'item_code', type: ui.FieldType.TEXT, label: 'Item Code' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        sublistItemDetail.addField({ id: 'item_name', type: ui.FieldType.TEXT, label: 'Item Name ' });
        sublistItemDetail.addField({ id: 'sales_unit', type: ui.FieldType.TEXT, label: 'Sales Unit' });
        sublistItemDetail.addField({ id: 'conv_pallet', type: ui.FieldType.FLOAT, label: 'Conv.Pallet' });
        sublistItemDetail.addField({ id: 'conv_ream', type: ui.FieldType.FLOAT, label: 'Ream' });
        sublistItemDetail.addField({ id: 'conv_carton', type: ui.FieldType.FLOAT, label: 'Carton' });
        sublistItemDetail.addField({ id: 'quantity_order', type: ui.FieldType.FLOAT, label: 'Qty (Order)' });
        sublistItemDetail.addField({ id: 'quantity_confirm', type: ui.FieldType.FLOAT, label: 'Qty (Confirm)' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        sublistItemDetail.addField({ id: 'gross_amount', type: ui.FieldType.FLOAT, label: 'Gross Amount' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        sublistItemDetail.addField({ id: 'gross_amount_old', type: ui.FieldType.FLOAT, label: 'Gross Amount Old' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        sublistItemDetail.addField({ id: 'line_id', type: ui.FieldType.TEXT, label: 'Line ID' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        sublistItemDetail.addField({ id: 'shipping_mark', type: ui.FieldType.TEXT, label: 'Shipping Mark' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        sublistItemDetail.addField({ id: 'line_unique_key', type: ui.FieldType.TEXT, label: 'Line Unique Key' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        sublistItemDetail.addField({ id: 'item_id', type: ui.FieldType.TEXT, label: 'Item' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        sublistItemDetail.addField({ id: 'tax_code', type: ui.FieldType.TEXT, label: 'Tax Code' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        sublistItemDetail.addField({ id: 'custcol_donot_cal_conv', type: ui.FieldType.CHECKBOX, label: 'Do Not Calculate Conversion' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        // var sublistShippingDetail = form.addSublist({ id: 'shipping_detail', type: ui.SublistType.LIST, label: 'Shipping Detail', tab: 'custtab_bl_instruction' });
        // var sublistBookingInfo = form.addSublist({ id: 'booking_info', type: ui.SublistType.LIST, label: 'Booking Info.', tab: 'custtab_booking' });
        // ################################################################################################
        // Load Search Data && Add Value to Sublist
        // ################################################################################################
        // เปลี่ยนไปใช้ filter จาก internal id ของ pi
        let resultsPiForGenSaMain = loadSSPiForGenSaMain({}, [pi_internalid]);
        // let pi_internal_id = 'EC-2506'; // PI Internal ID
        let resultsPiForGenSaLine = loadSSPiForGenSaLine(pi_internalid);
        // ################################################################################################
        // Add Sublist Value
        // ################################################################################################
        // Proforma Invoice Details
        resultsPiForGenSaMain.forEach(function (row, index) {
            let internalid = row.getValue({ "name": "internalid", "label": "Internal ID" });
            let trandate = row.getValue({ "name": "trandate", "label": "PI Date" });
            let tranid = row.getValue({ "name": "tranid", "label": "PI No." });
            // let subsidiarynohierarchy = row.getValue({ "name": "subsidiarynohierarchy", "label": "Subsidiary" });
            // let entity = row.getValue({ "name": "entity", "label": "Customer" });
            // let entityid = row.getValue({ "name": "entityid", "join": "customerMain", "label": "Customer Code" });
            // let companyname = row.getValue({ "name": "companyname", "join": "customerMain", "label": "Customer Name" });
            let currency = row.getValue({ "name": "currency", "label": "Currency" });
            // let custbody_payment_terms = row.getValue({ "name": "custbody_payment_terms", "label": "Payment Terms" });
            let custbody_incoterms = row.getValue({ "name": "custbody_incoterms", "label": "Incoterms" });
            let ship_to_country = row.getValue({ "name": "custbody_ship_to_country", "label": "Ship to Country" });
            let etd_date = row.getValue({ "name": "shipdate", "label": "ETD Date" });
            if (!!tranid) {
                sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'tranid', value: tranid });
            }
            if (!!internalid) {
                sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'pi_internal_id', value: internalid });
            }
            if (!!trandate) {
                sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'trandate', value: trandate });
            }
            if (!!etd_date) {
                sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'etd_date', value: etd_date });
            }
            if (!!ship_to_country) {
                sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'ship_to_country', value: ship_to_country });
            }
            if (!!custbody_incoterms) {
                sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'custbody_incoterms', value: custbody_incoterms });
            }
            if (!!currency) {
                sublistSsPiForGenSaMain.setSublistValue({ line: index, id: 'currency', value: currency });
            }
        });
        let resultsSaRemainingQty = loadSSSARemainingQty(pi_internalid);
        log.debug('resultsSaRemainingQty', resultsSaRemainingQty);
        // Item Detail
        let index = 0;
        resultsPiForGenSaLine.forEach(function (row) {
            let pi_internal_id = row.getValue({ "name": "internalid", "label": "PI Internal ID" });
            let pi_no = row.getValue({ "name": "tranid", "label": "PI No." });
            let pi_date = row.getValue({ "name": "trandate", "label": "PI Date" });
            let subsidiary = row.getValue({ "name": "subsidiarynohierarchy", "label": "Subsidiary" });
            let customer = row.getValue({ "name": "entity", "label": "Customer" });
            let customer_code = row.getValue({ "name": "entityid", "join": "customerMain", "label": "Customer Code" });
            let customer_name = row.getValue({ "name": "companyname", "join": "customerMain", "label": "Customer Name" });
            let currency = row.getValue({ "name": "currency", "label": "Currency" });
            let payment_terms = row.getValue({ "name": "custbody_payment_terms", "label": "Payment Terms" });
            let incoterms = row.getValue({ "name": "custbody_incoterms", "label": "Incoterms" });
            let item_code = row.getText({ "name": "item", "label": "Item Code" });
            let item_name = row.getValue({ "name": "displayname", "join": "item", "label": "Item Name " });
            let sales_unit = row.getValue({ "name": "unit", "label": "Sales Unit" });
            let quantity = row.getValue({ "name": "quantityuom", "label": "Quantity" });
            let unit_price = row.getValue({ "name": "fxrate", "label": "Unit Price" });
            let amount = row.getValue({ "name": "fxamount", "label": "Amount" });
            let tax_code = row.getValue({ "name": "taxcode", "label": "Tax Code" });
            let tax_amt = row.getValue({ "name": "taxamount", "label": "Tax Amt" });
            let gross_amount = row.getValue({ "name": "grossamount", "label": "Gross Amount" });
            let line_id = row.getValue({ "name": "line", "label": "Line ID" });
            let line_unique_key = row.getValue({ "name": "lineuniquekey", "label": "Line Unique Key" });
            let linesequencenumber = row.getValue({ "name": "linesequencenumber", "label": "Line Sequence Number" });
            let custcol_shipping_mark = row.getValue({ "name": "custcol_shipping_mark", "label": "Shipping Mark" });
            let item_id = row.getValue({ "name": "item", "label": "Item Code" });
            let custcol_donot_cal_conv = row.getValue({ "name": "custcol_donot_cal_conv", "label": "Do not Cal Conversion" });
            let quantity_remaining = Number(quantity);
            let keys = pi_internal_id + '_' + line_id;
            let qty_confirm = resultsSaRemainingQty[keys]?.custcol_ex_qty_confirm || 0;
            if (qty_confirm) {
                quantity_remaining = quantity_remaining - qty_confirm;
                /**
                 * If quantity_remaining <= 0, then return
                 * ข้ามรายการที่ remaining เหลือ 0
                 */
                if (quantity_remaining <= 0) {
                    return;
                }
                log.debug('quantity_remaining | ' + keys, quantity_remaining);
            }
            sublistItemDetail.setSublistValue({ line: index, id: 'pi_no', value: pi_no });
            // sublistItemDetail.setSublistValue({ line: index, id: 'line_id', value: linesequencenumber });
            sublistItemDetail.setSublistValue({ line: index, id: 'line_id', value: line_id });
            sublistItemDetail.setSublistValue({ line: index, id: 'line_unique_key', value: line_unique_key });
            if (!!pi_internal_id) {
                sublistItemDetail.setSublistValue({ line: index, id: 'pi_internal_id', value: pi_internal_id });
            }
            if (!!pi_date) {
                sublistItemDetail.setSublistValue({ line: index, id: 'pi_date', value: pi_date });
            }
            if (!!subsidiary) {
                sublistItemDetail.setSublistValue({ line: index, id: 'subsidiary', value: subsidiary });
            }
            if (!!customer) {
                sublistItemDetail.setSublistValue({ line: index, id: 'customer', value: customer });
            }
            if (!!customer_code) {
                sublistItemDetail.setSublistValue({ line: index, id: 'customer_code', value: customer_code });
            }
            if (!!customer_name) {
                sublistItemDetail.setSublistValue({ line: index, id: 'customer_name', value: customer_name });
            }
            if (!!currency) {
                sublistItemDetail.setSublistValue({ line: index, id: 'currency', value: currency });
            }
            if (!!payment_terms) {
                sublistItemDetail.setSublistValue({ line: index, id: 'payment_terms', value: payment_terms });
            }
            if (!!incoterms) {
                sublistItemDetail.setSublistValue({ line: index, id: 'incoterms', value: incoterms });
            }
            if (!!item_code) {
                sublistItemDetail.setSublistValue({ line: index, id: 'item_code', value: item_code });
            }
            if (!!item_name) {
                sublistItemDetail.setSublistValue({ line: index, id: 'item_name', value: item_name });
            }
            if (!!sales_unit) {
                sublistItemDetail.setSublistValue({ line: index, id: 'sales_unit', value: sales_unit });
            }
            if (!!quantity_remaining) {
                sublistItemDetail.setSublistValue({ line: index, id: 'quantity_order', value: libCode.toFixed2(quantity_remaining, 3) });
                sublistItemDetail.setSublistValue({ line: index, id: 'quantity_confirm', value: libCode.toFixed2(quantity_remaining, 3) });
            }
            else {
                sublistItemDetail.setSublistValue({ line: index, id: 'quantity_order', value: '0' });
                sublistItemDetail.setSublistValue({ line: index, id: 'quantity_confirm', value: '0' });
            }
            if (!!unit_price) {
                sublistItemDetail.setSublistValue({ line: index, id: 'unit_price', value: unit_price });
            }
            if (!!amount) {
                sublistItemDetail.setSublistValue({ line: index, id: 'amount', value: amount });
            }
            if (!!item_id) {
                sublistItemDetail.setSublistValue({ line: index, id: 'item_id', value: item_id });
            }
            if (!!tax_code) {
                sublistItemDetail.setSublistValue({ line: index, id: 'tax_code', value: tax_code });
            }
            if (!!tax_amt) {
                sublistItemDetail.setSublistValue({ line: index, id: 'tax_amt', value: tax_amt });
            }
            if (!!custcol_shipping_mark) {
                sublistItemDetail.setSublistValue({ line: index, id: 'shipping_mark', value: custcol_shipping_mark });
            }
            if (!!gross_amount) {
                sublistItemDetail.setSublistValue({ line: index, id: 'gross_amount_old', value: gross_amount });
                sublistItemDetail.setSublistValue({ line: index, id: 'gross_amount', value: gross_amount });
            }
            if (!!custcol_donot_cal_conv) {
                sublistItemDetail.setSublistValue({ line: index, id: 'custcol_donot_cal_conv', value: 'T' });
            }
            index++;
        });
        log.debug('defaultFieldValue', defaultFieldValue);
        // =============================================================================
        // form.addButton({ label: 'Search', id: 'btn_search', functionName: 'goToPage("' + STEP_PAGE.PAGE1_FILTER + '", { step : "' + STEP_PAGE.PAGE_2_SELECT_DATA + '" })' });
        form.addButton({ label: 'Back', id: 'btn_back', functionName: 'goToPage("' + STEP_PAGE.PAGE_2_SELECT_DATA + '")' });
        form.addSubmitButton({ label: 'Submit' });
        form.clientScriptModulePath = CS_SCRIPTID_PATH;
        // Get All Body fields
        let allFields = customForm.getAllFields();
        // log.debug('Body All Fields', allFields);
        form.updateDefaultValues({
            step: STEP_PAGE.PAGE_4_SUBMIT_DATA,
            step_current: STEP_PAGE.PAGE_3_PREVIEW_DATA,
            script_id: runtime.getCurrentScript().id,
            script_deploy_id: runtime.getCurrentScript().deploymentId,
            custpage_body_all_field: JSON.stringify(allFields),
            address_map: JSON.stringify(ADDRESS_MAP),
            customer_address_map: JSON.stringify(CUSTOMER_ADDRESS_MAP),
            custpage_inprogress_bar: libUtility.getLoading('System Process....'),
            ...paramsValueObj,
            ...defaultFieldValue
        });
        response.writePage(form);
    }
    function Page4_SubmitData(context, params) {
        const { request, response } = context;
        // =============================================================================
        const FOLDER_ATTACHMENT_ID = 52921; // SuiteScripts > EXP > Shipping Advice Export > Attachments
        let uploadfiles = request.files;
        // for (const file in uploadfiles) {
        //     if (!Object.hasOwn(uploadfiles, file)) continue;
        //     let uploadfile = uploadfiles[file];
        // uploadFileToFolder(uploadfile, FOLDER_ATTACHMENT_ID);
        // }
        let lineCount = request.getLineCount({ group: 'proforma_invoice_details' });
        let resultsProformaInvoiceDetails = [];
        for (let i = 0; i < lineCount; i++) {
            let pi_internal_id = request.getSublistValue({ group: 'proforma_invoice_details', name: 'pi_internal_id', line: i });
            if (pi_internal_id) {
                resultsProformaInvoiceDetails.push(pi_internal_id);
            }
        }
        let lineCountItemDetail = request.getLineCount({ group: 'item_detail' });
        let resultsItemDetails = [];
        for (let i = 0; i < lineCountItemDetail; i++) {
            let isselected = request.getSublistValue({ group: 'item_detail', name: 'is_select', line: i }) || 'F';
            if (isselected === 'F') {
                continue;
            }
            let quantity_confirm = Number(request.getSublistValue({ group: 'item_detail', name: 'quantity_confirm', line: i }));
            let shipping_mark = (request.getSublistValue({ group: 'item_detail', name: 'shipping_mark', line: i }));
            let line_id = request.getSublistValue({ group: 'item_detail', name: 'line_id', line: i }) || '0';
            let line_unique_key = request.getSublistValue({ group: 'item_detail', name: 'line_unique_key', line: i });
            let item_id = request.getSublistValue({ group: 'item_detail', name: 'item_id', line: i });
            let tax_code = request.getSublistValue({ group: 'item_detail', name: 'tax_code', line: i });
            let custcol_donot_cal_conv = request.getSublistValue({ group: 'item_detail', name: 'custcol_donot_cal_conv', line: i });
            if (quantity_confirm) {
                resultsItemDetails.push({
                    quantity_confirm,
                    line_id: parseInt(line_id),
                    line_unique_key: parseInt(line_unique_key),
                    item_id,
                    tax_code,
                    shipping_mark,
                    custcol_donot_cal_conv: custcol_donot_cal_conv === 'T' ? true : false
                });
            }
        }
        log.debug('resultsItemDetails', resultsItemDetails);
        // return response.write(JSON.stringify({ resultsItemDetails }, null, 1));
        if (resultsItemDetails.length === 0) {
            throw new Error("Invalid Item Details.");
        }
        if (resultsProformaInvoiceDetails.length === 0) {
            throw new Error("Invalid PI No.");
        }
        let so_id_main = resultsProformaInvoiceDetails[0];
        // ################################################################################################
        // ===== Create Job Record
        // ################################################################################################
        var job_record_rec = record.create({ type: 'customrecord_exp_splitpi_jobprocess', isDynamic: true });
        job_record_rec.setValue('custrecord_spj_script_id', runtime.getCurrentScript().id);
        job_record_rec.setValue('custrecord_spj_combine_pi_internal_id', resultsProformaInvoiceDetails.join(','));
        job_record_rec.setValue('custrecord_spj_combine_pi', resultsProformaInvoiceDetails);
        let job_record_id = job_record_rec.save();
        log.debug('job_record_id', job_record_id);
        let redirectParams = {
            job_record_id,
            ci_id: null,
            pi_id: so_id_main,
            booking_id: null,
            step: STEP_PAGE.VIEW_LOG
        };
        try {
            let custpage_subsidiary = params.custpage_subsidiary;
            let custpage_customer = params.custpage_customer;
            let custpage_shipaddresslist = params.custpage_shipaddresslist;
            let etdDateObj = libUtility.strToDate(params['shipdate'], null);
            // ################################################################################################
            // ===== Generate Commercial Invoice
            // ################################################################################################
            // var subListId = 'custpage_proforma_invoice_list';
            // Submit ลง Form F - Sales Order Form (Export) = 176
            let piData = libUtility.getLookupFields('salesorder', so_id_main, ['shipdate', 'custbody_exp_request__etd_date', 'custbody_ex_transfer_to_export', 'custbody_payment_terms', 'custbody_incoterms.custrecord_incl_fob_in_inv']);
            // let shipdateObj = (piData.shipdate ? libUtility.strToDate(piData.shipdate) : null);
            let requeryDateObj = (piData.custbody_exp_request__etd_date ? libUtility.strToDate(piData.custbody_exp_request__etd_date) : null);
            let includeFOBInInvoicePrice = piData['custbody_incoterms.custrecord_incl_fob_in_inv'] || false; // Incoterms include FOB in Invoice Price
            let custbody_ex_transfer_to_export = piData.custbody_ex_transfer_to_export || false; // Transfer to Export
            let cRecord = record.copy({
                type: 'salesorder',
                id: so_id_main,
                isDynamic: true,
                defaultValues: {
                    // customform: '176', // Sales Order Form (Export)
                    customform: '259', // PD
                }
            });
            // cRecord.setValue('custbody_exp_ordertype', 3); // Commercial Invoice
            cRecord.setValue('custbody_exp_ordertype', '6'); // 6	Custom Invoice
            cRecord.setValue('orderstatus', 'B'); // Pending Approval
            cRecord.setValue('custbody_exp_originalprofoma', '');
            cRecord.setValue('custbody_exp_splitnumber', '');
            cRecord.setValue('custbody_shippingadvice_status', 4); // Draft SA
            cRecord.setValue('custbody_exp_proformainvoicsplit', false);
            cRecord.setValue('custbody_is_shippingadvice', true);
            cRecord.setValue('custbody_is_combine_so', false); // IS Combine SO
            cRecord.setValue('custbody_item_disp_on_pf', 2);
            cRecord.setValue('custbody_ex_ref_pi', so_id_main);
            cRecord.setValue('custbody_ex_transfer_to_export', custbody_ex_transfer_to_export);
            if (piData.custbody_payment_terms) {
                cRecord.setValue('custbody_payment_terms', piData.custbody_payment_terms);
            }
            // if (shipdateObj) {
            //     cRecord.setValue('shipdate', shipdateObj);
            // }
            if (requeryDateObj) {
                cRecord.setValue('custbody_exp_request__etd_date', requeryDateObj);
            }
            if (custpage_shipaddresslist) {
                cRecord.setValue('shipaddresslist', custpage_shipaddresslist);
            }
            let taxcodeMapping = [];
            // Check Update Quantity and Remove Item
            let lineCountItem = cRecord.getLineCount({ sublistId: 'item' });
            for (var i = lineCountItem - 1; i >= 0; i--) {
                let line_unique_key = cRecord.getSublistValue({ sublistId: 'item', fieldId: 'lineuniquekey', line: i });
                let findValue = resultsItemDetails.find(item => Number(item.line_unique_key) === Number(line_unique_key));
                // log.debug('findValue', { line_unique_key, findValue });
                let quantity_confirm = findValue?.quantity_confirm;
                let taxcode = findValue?.tax_code;
                if (quantity_confirm > 0) {
                    let custcol_shipping_mark = findValue?.shipping_mark || '';
                    let custcol_donot_cal_conv = findValue?.custcol_donot_cal_conv;
                    cRecord.selectLine({ sublistId: 'item', line: i });
                    let rate = cRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'rate' });
                    let grossamt = cRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'grossamt' });
                    // let taxcode = cRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'taxcode' });
                    cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: quantity_confirm });
                    cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'price', value: '-1' }); // -1 : Custom
                    cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: rate });
                    // cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_shipping_mark', value: custcol_shipping_mark });
                    cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_ex_qty_confirm', value: quantity_confirm });
                    cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_pi_line_id', value: findValue?.line_id || '' });
                    cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'commitinventory', value: '3' }); // 3 : Do Not Commit
                    if (taxcode) {
                        taxcodeMapping.push({ line_unique_key: Number(line_unique_key), taxcode: taxcode });
                        cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'taxcode', value: taxcode });
                    }
                    if (etdDateObj) {
                        cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_estmated_ship_date', value: etdDateObj });
                    }
                    if (includeFOBInInvoicePrice === true && grossamt) {
                        cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_fob_net_amount_original', value: grossamt });
                    }
                    if (custcol_donot_cal_conv) {
                        cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_donot_cal_conv', value: custcol_donot_cal_conv });
                    }
                    cRecord.commitLine({ sublistId: 'item' });
                }
                else {
                    cRecord.removeLine({ sublistId: 'item', line: i });
                }
            }
            log.debug({
                title: 'lineCountItem Before Check',
                details: { lineCountItem: cRecord.getLineCount({ sublistId: 'item' }) }
            });
            // return response.write(JSON.stringify({
            //     resultsItemDetails,
            //     lineCountItem: cRecord.getLineCount({ sublistId: 'item' })
            // }, null, 1));
            // ################################################################################################
            // ===== Subtotal / Discount from SO
            // ################################################################################################
            let invTotalAmount = 0;
            let lineCountForTotal = cRecord.getLineCount({ sublistId: 'item' });
            for (let t = 0; t < lineCountForTotal; t++) {
                let lineAmt = cRecord.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: t });
                invTotalAmount = libCode.addNumber(invTotalAmount, lineAmt);
            }
            try {
                var resultsSsSoSubtotalDiscount = loadSOSubtotalDiscount(so_id_main);
                log.debug('Export - SO Subtotal/Discount', resultsSsSoSubtotalDiscount);
                var discountPct = resultsSsSoSubtotalDiscount.discountPct || 0;
                if (discountPct) {
                    // Add Subtotal line from SO onto SA (single item)
                    var subKey = Object.keys(resultsSsSoSubtotalDiscount.subtotal).length;
                    if (subKey) {
                        var sub = resultsSsSoSubtotalDiscount.subtotal;
                        try {
                            cRecord.selectNewLine({ sublistId: 'item' });
                            cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: sub.item });
                            cRecord.commitLine({ sublistId: 'item' });
                        }
                        catch (eSub) {
                            log.error('Export - Add Subtotal Line Error', { item: sub.item, error: libCode.getErrorMessage(eSub) });
                        }
                    }
                    // Add Discount line(s) from SO onto SA (can be multiple discounts)
                    if (resultsSsSoSubtotalDiscount.discount.length > 0) {
                        resultsSsSoSubtotalDiscount.discount.forEach(function (disc) {
                            var amountDisc = libCode.multipliedNumber(invTotalAmount, disc.weightPct) / 100;
                            log.debug('Export - Calculated Discount Amount', {
                                item: disc.item,
                                invTotalAmount: invTotalAmount,
                                weightPct: disc.weightPct,
                                amountDisc: amountDisc,
                            });
                            try {
                                cRecord.selectNewLine({ sublistId: 'item' });
                                cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: disc.item });
                                cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: amountDisc });
                                if (disc.pricelevel)
                                    cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'pricelevel', value: disc.pricelevel });
                                cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'amount', value: amountDisc });
                                if (disc.taxcode)
                                    cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'taxcode', value: disc.taxcode });
                                if (disc.location)
                                    cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: disc.location });
                                if (disc.custcol_promotion_ordercode1)
                                    cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_promotion_ordercode1', value: disc.custcol_promotion_ordercode1 });
                                if (disc.custcol_promotion_orderamt1)
                                    cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_promotion_orderamt1', value: disc.custcol_promotion_orderamt1 });
                                cRecord.commitLine({ sublistId: 'item' });
                            }
                            catch (eDisc) {
                                log.error('Export - Add Discount Line Error', { item: disc.item, error: libCode.getErrorMessage(eDisc) });
                            }
                        });
                    }
                }
                var lineCountAfter = cRecord.getLineCount({ sublistId: 'item' });
                log.debug('Export - After Line Process', {
                    lineCountAfter: lineCountAfter,
                    invTotalAmount: invTotalAmount,
                    discountPct: discountPct,
                });
            }
            catch (error) {
                log.error({
                    title: 'Export - SO Subtotal/Discount Error',
                    details: { so_id: so_id_main, error: libCode.getErrorMessage(error) }
                });
            }
            // Shipping Advice Information
            let shippingAdviceInformationFields = [
                { type: '', field_id: 'custbody_ex_agent_email' }, // Agent Email
                { type: '', field_id: 'custbody_ex_agent_tel' }, // Agent Tel
                { type: '', field_id: 'custbody_ex_agent_fax' }, // Agent Fax
                { type: '', field_id: 'custbody_ex_agent_address' }, // Agent Address
                { type: '', field_id: 'custbody_inv_cf_sa' }, // Confirm Shipping Advice
                { type: ui.FieldType.TEXTAREA, field_id: 'custbody_shipping_mask' }, // Shipping Mask
                { type: ui.FieldType.DATE, field_id: 'custbody_expiry_date' }, // Expiry Date
                { type: '', field_id: 'custbody_lastest_shipment' }, // Lastest Shipment
                { type: '', field_id: 'custbody_total_shipped' }, // Total Shipped
                { type: '', field_id: 'custbody_gross_weight' }, // Gross Weight
                { type: '', field_id: 'custbody_net_weight' }, // Net Weight
                { type: '', field_id: 'custbody_inv_final_destination' }, // Final Destination
                { type: '', field_id: 'custbody_insurance' }, // Insurance
                // { type: '', field_id: 'custbody_container_size' }, // Container Size
                { type: '', field_id: 'custbody_total_container' }, // Total Container
                { type: '', field_id: 'custbody_total_container_text' }, // Total Container (Text)
                // { type: '', field_id: 'custbody_dthc' }, // Insurance
            ];
            let blInstructionFields = [
                { type: '', field_id: 'custbody_ex_shipper_name' }, // Shipper Name
                { type: '', field_id: 'custbody_ex_oh_name' }, // OH Name
                { type: '', field_id: 'custbody_ex_oh_tel' }, // OH Tel
                { type: '', field_id: 'custbody_ex_freight_name' }, // Freight Name
                { type: '', field_id: 'custbody_ex_freight_tel' }, // Freight Tel
                { type: '', field_id: 'custbody_inv_special_note' }, // Special Note
                { type: '', field_id: 'custbody_ex_consignee_name' }, // Consignee Name
                { type: '', field_id: 'custbody_ex_consignee_email' }, // Consignee Email
                { type: '', field_id: 'custbody_ex_consignee_tel' }, // Consignee Tel
                { type: '', field_id: 'custbody_ex_consignee_fax' }, // Consignee Fax
                { type: '', field_id: 'custbody_ex_consignee_address' }, // Consignee Address
                { type: '', field_id: 'custbody_ex_notify_name1' }, // Notify Name1
                { type: '', field_id: 'custbody_ex_notify_email1' }, // Notify Email1
                { type: '', field_id: 'custbody_ex_notify_tel1' }, // Notify Tel1
                { type: '', field_id: 'custbody_ex_notify_fax1' }, // Notify Fax1
                { type: '', field_id: 'custbody_ex_notify_address1' }, // Notify Address1
                { type: '', field_id: 'custbody_ex_notify_name2' }, // Notify Name 2
                { type: '', field_id: 'custbody_ex_notify_address2' }, // Notify Address 2
                { type: '', field_id: 'custbody_ex_notify_tel2' }, // Notify Phone 2
                { type: '', field_id: 'custbody_ex_notify_fax2' }, // Notify Fax 2
                { type: '', field_id: 'custbody_ex_notify_email2' }, // Notify Email 2
            ];
            shippingAdviceInformationFields.forEach(function (field) {
                let field_id = field.field_id;
                let type = field.type;
                let field_value = (type == ui.FieldType.DATE) ? libUtility.strToDate(params[field_id], null) : params[field_id];
                if (!!field_id && !!field_value) {
                    cRecord.setValue({ fieldId: field.field_id, value: field_value });
                }
            });
            blInstructionFields.forEach(function (field) {
                let field_id = field.field_id;
                let type = field.type;
                let field_value = (type == ui.FieldType.DATE) ? libUtility.strToDate(params[field_id], null) : params[field_id];
                if (!!field_id && !!field_value) {
                    cRecord.setValue({ fieldId: field.field_id, value: field_value });
                }
            });
            // ################################################################################################
            // Create Booking Information
            // ################################################################################################
            let bookingInformationFields = [
                { type: '', field_id: 'custbody_ex_booking_no' }, // Booking No
                { type: '', field_id: 'custbody_ex_shipping_gent' }, // Shipping Agent/Freight Forwarder
                { type: '', field_id: 'custbody_ex_shipping_line' }, // Shipping Line/Carrier
                { type: '', field_id: 'custbody_ex_feedervesselname' }, // Feeder Vessel Name
                { type: '', field_id: 'custbody_ex_mothervesselname' }, // Mother Vessel Name
                { type: '', field_id: 'custbody_packing' }, // Packing
                { type: ui.FieldType.DATE, field_id: 'custbody_ex_ata_date' }, // ATA Date
                { type: ui.FieldType.DATE, field_id: 'custbody_ex_eta_date' }, // ETA Date
                { type: ui.FieldType.DATE, field_id: 'shipdate' }, // ETA Date
                // { type: '', field_id: 'custbody_ex_attachment' }, 
                { type: '', field_id: 'custpage_freight_term' },
                { type: '', field_id: 'custrecord_bki_bookingdescription' },
                { type: '', field_id: 'custrecord_bki_contact_person_pickup' },
                // { type: ui.FieldType.DATE, field_id: 'custbody_bl_date' }, // BL Date
            ];
            // ################################################################################################
            // ===== Upload File To Folder
            // ################################################################################################
            let fileAttachmentObj = uploadfiles['custbody_ex_attachment'] || {};
            log.debug('fileAttachmentObj | custbody_ex_attachment', fileAttachmentObj);
            if (fileAttachmentObj.name) {
                let uploadResult = uploadFileToFolder(fileAttachmentObj, FOLDER_ATTACHMENT_ID);
                log.debug('uploadResult', uploadResult);
                if (uploadResult.success) {
                    cRecord.setValue({ fieldId: 'custbody_ex_attachment', value: uploadResult.fileId });
                }
            }
            bookingInformationFields.forEach(function (field) {
                let field_id = field.field_id;
                let type = field.type;
                let field_value = (type == ui.FieldType.DATE) ? libUtility.strToDate(params[field_id], null) : params[field_id];
                if (!!field_id && !!field_value) {
                    cRecord.setValue({ fieldId: field.field_id, value: field_value });
                }
            });
            if (!!params.custrecord_ex_pickup_place)
                cRecord.setValue('custbody_ex_pickup_place', params.custrecord_ex_pickup_place);
            if (!!params.custrecord_ex_pickup_date)
                cRecord.setValue('custbody_ex_pickup_date', format.parse({ value: params.custrecord_ex_pickup_date, type: format.Type.DATE }));
            if (!!params.custrecord_ex_pickup_contact)
                cRecord.setValue('custbody_ex_pickup_contact', params.custrecord_ex_pickup_contact);
            if (!!params.custrecord_ex_pickup_contact_tel)
                cRecord.setValue('custbody_ex_pickup_contact_tel', params.custrecord_ex_pickup_contact_tel);
            if (!!params.custrecord_ex_loading_place)
                cRecord.setValue('custbody_ex_loading_place', params.custrecord_ex_loading_place);
            if (!!params.custrecord_ex_special_loading)
                cRecord.setValue('custbody_ex_special_loading', params.custrecord_ex_special_loading);
            if (!!params.custrecord_ex_return_place)
                cRecord.setValue('custbody_ex_return_place', params.custrecord_ex_return_place);
            if (!!params.custrecord_ex_return_contact)
                cRecord.setValue('custbody_ex_return_contact', params.custrecord_ex_return_contact);
            if (!!params.custrecord_return_contact_tel)
                cRecord.setValue('custbody_return_contact_tel', params.custrecord_return_contact_tel);
            if (!!params.custrecord_ex_first_return_date)
                cRecord.setValue('custbody_ex_first_return_date', format.parse({ value: params.custrecord_ex_first_return_date, type: format.Type.DATE }));
            if (!!params.custrecord_ex_closing_date)
                cRecord.setValue('custbody_ex_closing_date', format.parse({ value: params.custrecord_ex_closing_date, type: format.Type.DATE }));
            if (!!params.custrecord_ex_closing_time)
                cRecord.setValue('custbody_ex_closing_time', format.parse({ value: params.custrecord_ex_closing_time, type: format.Type.TIMEOFDAY }));
            if (!!params.custrecord_ex_vgmcutoff_date)
                cRecord.setValue('custbody_ex_vgmcutoff_date', format.parse({ value: params.custrecord_ex_vgmcutoff_date, type: format.Type.DATE }));
            if (!!params.custrecord_ex_vgmcutoff_time)
                cRecord.setValue('custbody_ex_vgmcutoff_time', format.parse({ value: params.custrecord_ex_vgmcutoff_time, type: format.Type.TIMEOFDAY }));
            if (!!params.custbody_ex_lc_no)
                cRecord.setValue('custbody_ex_lc_no', params.custbody_ex_lc_no);
            if (!!params.custbody_ex_latest_shipment)
                cRecord.setValue('custbody_ex_latest_shipment', format.parse({ value: params.custbody_ex_latest_shipment, type: format.Type.DATE }));
            if (!!params.custbody_expiry_date)
                cRecord.setValue('custbody_expiry_date', format.parse({ value: params.custbody_expiry_date, type: format.Type.DATE }));
            if (!!params.custbody_booking_confirmation_url)
                cRecord.setValue('custbody_ex_booking_confirm_attach', params.custbody_booking_confirmation_url);
            if (!!params.custbody_ero_attachment)
                cRecord.setValue('custbody_ex_ero_attach', params.custbody_ero_attachment);
            if (!!params.custbody_other_attachment)
                cRecord.setValue('custbody_ex_other_attach', params.custbody_other_attachment);
            let ciLineCount = cRecord.getLineCount({ sublistId: 'item' });
            let checkTaxcodeSet = [];
            for (let t = 0; t < ciLineCount; t++) {
                let luk = Number(cRecord.getSublistValue({ sublistId: 'item', fieldId: 'lineuniquekey', line: t }));
                let taxcode = cRecord.getSublistValue({ sublistId: 'item', fieldId: 'taxcode', line: t });
                checkTaxcodeSet.push({ line_unique_key: luk, taxcode: taxcode });
            }
            log.debug({
                title: 'checkTaxcodeSet Before Save',
                details: { checkTaxcodeSet, taxcodeMapping }
            });
            let new_ci_id = cRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            log.debug('new_ci_id', new_ci_id);
            // ################################################################################################
            // ===== Update Job Record
            // ################################################################################################
            let submitValueJobProcess = {
                custrecord_spj_ci_internal_id: new_ci_id,
                // custrecord_spj_ci_no: ci_doc,
                custrecord_spj_processcompleted: true,
            };
            record.submitFields({ type: 'customrecord_exp_splitpi_jobprocess', id: job_record_id, values: submitValueJobProcess });
            // ################################################################################################
            // ===== Close Sales Order (PI)
            // ################################################################################################
            record.submitFields({
                type: 'salesorder',
                id: so_id_main,
                values: {
                    custbody_exp_refcommercial: new_ci_id,
                    custbody_ignore_credit_control: true
                },
                options: {
                    enableSourcing: false,
                    ignoreMandatoryFields: true
                }
            });
            redirectParams.ci_id = new_ci_id;
        }
        catch (error) {
            log.error('Error Generate CI', error);
            let submitValueJobProcess = {
                // custrecord_spj_ci_internal_id: new_ci_id,
                custrecord_spj_error_message: error?.message || error,
                custrecord_spj_processcompleted: false,
            };
            record.submitFields({ type: 'customrecord_exp_splitpi_jobprocess', id: job_record_id, values: submitValueJobProcess });
        }
        if (!!redirectParams.ci_id) {
            // If CI is generated, redirect to CI record page
            redirect.toRecord({
                type: record.Type.SALES_ORDER,
                id: redirectParams.ci_id,
                parameters: {}
            });
        }
        else {
            // If CI is not generated, redirect to log page with job record id to show error message
            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: redirectParams
            });
        }
        // response.write(JSON.stringify({ redirectParams }, null, 5));
        return;
    }
    function Page5_View_Log(context, params) {
        const { request, response } = context;
        const { ci_id, job_record_id, pi_id } = params;
        let paramsValueObj = getFieldParams(params);
        // let USE_SUB = runtime.isFeatureInEffect({ feature: 'SUBSIDIARIES' });
        log.debug('paramsValueObj', paramsValueObj);
        // =============================================================================
        let form = ui.createForm({
            title: 'Generate Shipping Advice',
            hideNavBar: false,
        });
        /**
     * Create Fields [Hidden]
     */
        createFieldsHiddenBody(form);
        // ################################################################################################
        // Filter Group
        // ################################################################################################
        var fieldGroupFormat = { id: 'primary_information', label: 'Primary Information Filter' };
        var fieldGroup = form.addFieldGroup(fieldGroupFormat);
        fieldGroup.isBorderHidden = false;
        fieldGroup.isSingleColumn = false;
        let uiField = form.addField({ id: 'custpage_proforma_invoice', type: 'select', label: 'Proforma Invoice', source: 'transaction', container: 'primary_information' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        uiField = form.addField({ id: 'custpage_custom_invoice', type: 'select', label: 'Shipping Advice', source: 'transaction', container: 'primary_information' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        uiField = form.addField({ id: 'custpage_status_text', type: 'text', label: 'Status', source: null, container: 'primary_information' }).updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
        let jobProcessObj = libUtility.getLookupFields('customrecord_exp_splitpi_jobprocess', job_record_id, ['custrecord_spj_processcompleted', 'custrecord_spj_error_message']);
        log.debug('jobProcessObj', jobProcessObj);
        let custpage_status_text = '';
        if (jobProcessObj.custrecord_spj_processcompleted === true) {
            custpage_status_text = '<span style="color: green !important; font-weight:700; ">Completed</span>';
        }
        else {
            custpage_status_text = jobProcessObj.custrecord_spj_error_message || '';
        }
        // =============================================================================
        // form.addButton({ label: 'Search', id: 'btn_search', functionName: 'goToPage("' + STEP_PAGE.PAGE1_FILTER + '", { step : "' + STEP_PAGE.PAGE_2_SELECT_DATA + '" })' });
        form.addButton({ label: 'Back', id: 'btn_back', functionName: 'goToPage("' + STEP_PAGE.PAGE1_FILTER + '")' });
        // form.addSubmitButton({ label: 'Submit' });
        form.clientScriptModulePath = CS_SCRIPTID_PATH;
        // Get All Body fields
        // let allFields = customForm.getAllFields();
        // log.debug('Body All Fields', allFields);
        form.updateDefaultValues({
            step: STEP_PAGE.PAGE_4_SUBMIT_DATA,
            step_current: STEP_PAGE.PAGE_3_PREVIEW_DATA,
            script_id: runtime.getCurrentScript().id,
            script_deploy_id: runtime.getCurrentScript().deploymentId,
            custpage_inprogress_bar: libUtility.getLoading('System Process....'),
            custpage_proforma_invoice: pi_id,
            custpage_custom_invoice: ci_id,
            custpage_status_text: custpage_status_text,
            ...paramsValueObj
        });
        response.writePage(form);
        // context.response.write(JSON.stringify({ params }, null, 5));
    }
    /**
     *
     * @param form
     * @param displayType
     *
     * Edit Mode = ui.FieldDisplayType.ENTRY
     *
     * View Mode = ui.FieldDisplayType.DISABLED
     *
     */
    function createFieldsBody(form, displayType = ui.FieldDisplayType.ENTRY) {
        // ################################################################################################
        // Filter Group
        // ################################################################################################
        var fieldGroupFormat = { id: 'primary_information', label: 'Primary Information Filter' };
        var fieldGroup = form.addFieldGroup(fieldGroupFormat);
        fieldGroup.isBorderHidden = false;
        fieldGroup.isSingleColumn = false;
        form.addFieldGroup({ id: 'proforma_invoice', label: 'Proforma Invoice' });
        let uiField;
        uiField = form.addField({ id: 'custpage_subsidiary', type: 'select', label: 'Subsidiary', source: 'subsidiary', container: 'primary_information' });
        uiField.updateDisplayType({ displayType: displayType });
        uiField.isMandatory = true;
        uiField = form.addField({ id: 'custpage_customer', type: 'select', label: 'Customer', source: 'customer', container: 'primary_information' });
        uiField.updateDisplayType({ displayType: displayType });
        uiField.isMandatory = true;
        uiField = form.addField({ id: 'custpage_currency', type: 'select', label: 'Currency', source: 'currency', container: 'primary_information' });
        uiField.updateDisplayType({ displayType: displayType });
        // uiField.isMandatory = true;
        uiField = form.addField({ id: 'custpage_incoterms', type: 'select', label: 'Incoterms', source: 'customrecord_customer_incoterms', container: 'primary_information' });
        uiField.updateDisplayType({ displayType: displayType });
        uiField.updateBreakType({ breakType: ui.FieldBreakType.STARTCOL });
        uiField = form.addField({ id: 'custpage_ship_to', type: 'select', label: 'Ship to Country', source: 'customrecord_cseg_cust_country', container: 'primary_information' });
        uiField.updateDisplayType({ displayType: displayType });
        // Proforma Invoice
        uiField = form.addField({ id: 'custpage_from_trandate', type: 'date', label: 'PI Date From', source: null, container: 'proforma_invoice' });
        uiField.updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
        uiField = form.addField({ id: 'custpage_to_trandate', type: 'date', label: 'PI Date To', source: null, container: 'proforma_invoice' });
        uiField.updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
        uiField = form.addField({ id: 'custpage_from_etd', type: 'date', label: 'ETD Date From', source: null, container: 'proforma_invoice' });
        uiField.updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
        uiField.updateBreakType({ breakType: ui.FieldBreakType.STARTCOL });
        uiField = form.addField({ id: 'custpage_to_etd', type: 'date', label: 'ETD Date To', source: null, container: 'proforma_invoice' });
        uiField.updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
        uiField = form.addField({ id: 'custpage_pi_filter', type: ui.FieldType.TEXT, label: 'PI/SO No.', source: null, container: 'proforma_invoice' });
        uiField.updateDisplayType({ displayType: ui.FieldDisplayType.ENTRY });
        uiField.updateBreakType({ breakType: ui.FieldBreakType.STARTCOL });
        uiField = form.addField({ id: 'custpage_pi_no', type: ui.FieldType.TEXT, label: 'Selected PI ID', source: null, container: 'proforma_invoice' });
        uiField.updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        createFieldsHiddenBody(form);
    }
    /**
     * Create Hidden Fields
     * @param form
     */
    function createFieldsHiddenBody(form) {
        // HIDDEN Fields
        form.addField({ id: 'step', type: ui.FieldType.TEXT, label: 'Step' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        form.addField({ id: 'step_current', type: ui.FieldType.TEXT, label: 'Step' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        form.addField({ id: 'script_id', type: ui.FieldType.TEXT, label: 'Script Id' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        form.addField({ id: 'script_deploy_id', type: ui.FieldType.TEXT, label: 'Script Deploy Id' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        form.addField({ id: 'custpage_inprogress_bar', type: ui.FieldType.INLINEHTML, label: 'Inprogress Bar' }); //.updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        form.addField({ id: 'custpage_body_all_field', type: ui.FieldType.TEXTAREA, label: 'Mapping Body Field' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        form.addField({ id: 'address_map', type: ui.FieldType.LONGTEXT, label: 'Address Map' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        form.addField({ id: 'customer_address_map', type: ui.FieldType.LONGTEXT, label: 'Customer Address Map' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        // HIDDEN Fields
    }
    /*========================================= Repositories ==============================*/
    /**
     *
     * - SEARCH ID : customsearch_ss_pi_for_gen_sa_line
     *
    @example
    
    let resultsPiForGenSaLine = getPiForGenerateShippingAdvice(paramsValue);
    
     */
    function getPiForGenerateShippingAdvice(paramsValue = {}) {
        let ssFilters = [];
        if (!paramsValue.custpage_pi_filter) {
            // Subsidiary
            ssFilters.push({ "name": "subsidiary", join: null, "operator": "is", "values": paramsValue.custpage_subsidiary });
            // Currency
            if (paramsValue.custpage_currency) {
                ssFilters.push({ "name": "currency", join: null, "operator": "is", "values": paramsValue.custpage_currency });
            }
            // Customer
            ssFilters.push({ "name": "entity", join: null, "operator": "is", "values": paramsValue.custpage_customer });
        }
        // PI Date
        if (paramsValue.custpage_from_trandate) {
            ssFilters.push({ "name": "trandate", join: null, "operator": "onorafter", "values": paramsValue.custpage_from_trandate });
        }
        if (paramsValue.custpage_to_trandate) {
            ssFilters.push({ "name": "trandate", join: null, "operator": "onorbefore", "values": paramsValue.custpage_to_trandate });
        }
        // ETD Date
        /**
         *
        if (paramsValue.custpage_from_etd) {
            ssFilters.push({ "name": "shipdate", join: null, "operator": "onorafter", "values": paramsValue.custpage_from_etd });
        }
    
        if (paramsValue.custpage_to_etd) {
            ssFilters.push({ "name": "shipdate", join: null, "operator": "onorbefore", "values": paramsValue.custpage_to_etd });
        }
         */
        // PI No.
        if (paramsValue.custpage_pi_filter) {
            ssFilters.push({ "name": "tranid", join: null, "operator": "contains", "values": paramsValue.custpage_pi_filter });
        }
        // Incoterms
        if (paramsValue.custpage_incoterms) {
            ssFilters.push({ "name": "custbody_incoterms", join: null, "operator": "is", "values": paramsValue.custpage_incoterms });
        }
        // Ship to Country
        if (paramsValue.custpage_ship_to) {
            ssFilters.push({ "name": "custbody_ship_to_country", join: null, "operator": "is", "values": paramsValue.custpage_ship_to });
        }
        // Item Type <> Subtotal & Discount
        ssFilters.push({ "name": "type", join: "item", "operator": "noneof", "values": ['Subtotal', 'Discount'] });
        const SS_PI_FOR_GEN_SA_LINE = 'customsearch_ss_pi_for_gen_sa_line';
        let ssResults = libCode.loadSavedSearch(null, SS_PI_FOR_GEN_SA_LINE, ssFilters, []);
        //console.log({ ssResults: ssResults.length });
        log.debug(SS_PI_FOR_GEN_SA_LINE, { ss_length: ssResults.length, ssFilters: ssFilters });
        let piIds = ssResults.map(function (row) {
            return row.getValue({ "name": "internalid", "label": "Pi Internalid" });
        });
        piIds = libUtility.removeDuplicates(piIds);
        piIds = libUtility.removeEmptyValues(piIds);
        let resultsSaRemainingQty = {};
        if (piIds.length > 0) {
            resultsSaRemainingQty = loadSSSARemainingQty(piIds);
        }
        let resultsGenerateShippingAdvice = {};
        let so_ids = ssResults.map(row => row.getValue({ "name": "internalid", "label": "PI Internal ID" }));
        let soMainlineData = {};
        so_ids = libUtility.removeDuplicates(so_ids);
        so_ids = libUtility.removeEmptyValues(so_ids);
        if (so_ids.length > 0) {
            let ssMainFilters = [
                { name: 'internalid', operator: 'is', values: so_ids },
                { name: 'mainline', operator: 'is', values: 'T' },
            ];
            // ETD Date
            if (paramsValue.custpage_from_etd) {
                ssMainFilters.push({ "name": "shipdate", join: null, "operator": "onorafter", "values": paramsValue.custpage_from_etd });
            }
            if (paramsValue.custpage_to_etd) {
                ssMainFilters.push({ "name": "shipdate", join: null, "operator": "onorbefore", "values": paramsValue.custpage_to_etd });
            }
            var ss_so_mainline = libCode.loadSavedSearch('transaction', null, ssMainFilters, ['internalid', 'entity', 'shipdate']);
            log.debug('ss_so_mainline', { length: ss_so_mainline.length, ssMainFilters });
            for (var i = 0; i < ss_so_mainline.length; i++) {
                var so_id_ml = ss_so_mainline[i].getValue({ name: 'internalid' });
                soMainlineData[so_id_ml] = {
                    entity: ss_so_mainline[i].getValue({ name: 'entity' }),
                    shipdate: ss_so_mainline[i].getValue({ name: 'shipdate' }),
                };
            }
        }
        ssResults.forEach(function (row) {
            let pi_internal_id = row.getValue({ "name": "internalid", "label": "PI Internal ID" });
            let line_id = row.getValue({ "name": "line", "label": "Line ID" });
            let pi_no = row.getValue({ "name": "tranid", "label": "PI No." });
            let quantity = row.getValue({ "name": "quantityuom", "label": "Quantity" });
            let pi_date = row.getValue({ "name": "trandate", "label": "PI Date" });
            let currency = row.getValue({ "name": "currency", "label": "Currency" });
            let incoterms = row.getValue({ "name": "custbody_incoterms", "label": "Incoterms" });
            let custbody_ship_to_country = row.getValue({ "name": "custbody_ship_to_country", "label": "Ship to Country" });
            let tax_code = row.getValue({ "name": "taxcode", "label": "Tax Code" });
            let tax_code_text = row.getText({ "name": "taxcode", "label": "Tax Code" });
            let etd_date;
            if (soMainlineData[pi_internal_id]) {
                etd_date = soMainlineData[pi_internal_id].shipdate;
            }
            else {
                return;
            }
            let keys = pi_internal_id + '_' + line_id;
            let custcol_ex_qty_confirm = resultsSaRemainingQty[keys]?.custcol_ex_qty_confirm;
            /**
             * Check if the quantity is greater than the remaining quantity
             */
            if (custcol_ex_qty_confirm) {
                if (custcol_ex_qty_confirm < quantity) {
                    if (resultsGenerateShippingAdvice[pi_internal_id] === undefined) {
                        resultsGenerateShippingAdvice[pi_internal_id] = {
                            tranid: pi_no,
                            pi_internalid: pi_internal_id,
                            trandate: pi_date,
                            etd_date: etd_date,
                            ship_to_country: custbody_ship_to_country,
                            custbody_incoterms: incoterms,
                            currency: currency,
                            tax_code: tax_code,
                            tax_code_text: tax_code_text
                        };
                    }
                }
            }
            else {
                if (resultsGenerateShippingAdvice[pi_internal_id] === undefined) {
                    resultsGenerateShippingAdvice[pi_internal_id] = {
                        tranid: pi_no,
                        pi_internalid: pi_internal_id,
                        trandate: pi_date,
                        etd_date: etd_date,
                        ship_to_country: custbody_ship_to_country,
                        custbody_incoterms: incoterms,
                        currency: currency,
                        tax_code: tax_code,
                        tax_code_text: tax_code_text
                    };
                }
            }
        });
        return Object.values(resultsGenerateShippingAdvice);
    }
    /**
     *
     * SEARCH ID : customsearch_ss_pi_for_gen_sa_main
     *
     */
    function loadSSPiForGenSaMain(paramsValue = {}, selectedPiInternalId = []) {
        let ssFilters = [];
        if (selectedPiInternalId.length === 0) {
            // Subsidiary
            ssFilters.push({ "name": "subsidiary", join: null, "operator": "is", "values": paramsValue.custpage_subsidiary });
            // Currency
            ssFilters.push({ "name": "currency", join: null, "operator": "is", "values": paramsValue.custpage_currency });
            // Customer
            ssFilters.push({ "name": "entity", join: null, "operator": "is", "values": paramsValue.custpage_customer });
            // PI Date
            if (paramsValue.custpage_from_trandate) {
                ssFilters.push({ "name": "trandate", join: null, "operator": "onorafter", "values": paramsValue.custpage_from_trandate });
            }
            if (paramsValue.custpage_to_trandate) {
                ssFilters.push({ "name": "trandate", join: null, "operator": "onorbefore", "values": paramsValue.custpage_to_trandate });
            }
            // ETD Date
            if (paramsValue.custpage_from_etd) {
                ssFilters.push({ "name": "shipdate", join: null, "operator": "onorafter", "values": paramsValue.custpage_from_etd });
            }
            if (paramsValue.custpage_to_etd) {
                ssFilters.push({ "name": "shipdate", join: null, "operator": "onorbefore", "values": paramsValue.custpage_to_etd });
            }
            // PI No.
            if (paramsValue.custpage_pi_filter) {
                ssFilters.push({ "name": "tranid", join: null, "operator": "contains", "values": paramsValue.custpage_pi_filter });
            }
            // Incoterms
            if (paramsValue.custpage_incoterms) {
                ssFilters.push({ "name": "custbody_incoterms", join: null, "operator": "is", "values": paramsValue.custpage_incoterms });
            }
            // Ship to Country
            if (paramsValue.custpage_ship_to) {
                ssFilters.push({ "name": "custbody_ship_to_country", join: null, "operator": "is", "values": paramsValue.custpage_ship_to });
            }
        }
        else {
            // Internal ID
            ssFilters.push({ "name": "internalid", join: null, "operator": "is", "values": selectedPiInternalId });
        }
        const SS_PI_FOR_GEN_SA_MAIN = 'customsearch_ss_pi_for_gen_sa_main';
        let ssResults = libCode.loadSavedSearch(null, SS_PI_FOR_GEN_SA_MAIN, ssFilters, []);
        //console.log({ ssResults: ssResults.length });
        log.debug(SS_PI_FOR_GEN_SA_MAIN, { ss_length: ssResults.length, ssFilters: ssFilters });
        // ssResults.forEach(function (row) {
        //     let trandate = row.getValue({ "name": "trandate", "label": "PI Date" });
        //     let tranid = row.getValue({ "name": "tranid", "label": "PI No." });
        //     let subsidiarynohierarchy = row.getValue({ "name": "subsidiarynohierarchy", "label": "Subsidiary" });
        //     let entity = row.getValue({ "name": "entity", "label": "Customer" });
        //     let entityid = row.getValue({ "name": "entityid", "join": "customerMain", "label": "Customer Code" });
        //     let companyname = row.getValue({ "name": "companyname", "join": "customerMain", "label": "Customer Name" });
        //     let currency = row.getValue({ "name": "currency", "label": "Currency" });
        //     let custbody_payment_terms = row.getValue({ "name": "custbody_payment_terms", "label": "Payment Terms" });
        //     let custbody_incoterms = row.getValue({ "name": "custbody_incoterms", "label": "Incoterms" });
        // });
        return ssResults;
    }
    /**
     *
     * SEARCH ID : customsearch_ss_pi_for_gen_sa_line
     *
    @example
    let pi_internal_id = 'EC-2506'; // PI Internal ID
    
    let resultsPiForGenSaLine = loadSSPiForGenSaLine(pi_internal_id);
    
     */
    function loadSSPiForGenSaLine(pi_internal_id) {
        let ssFilters = [];
        // PI Internal ID
        ssFilters.push({ "name": "internalid", join: null, "operator": "is", "values": pi_internal_id });
        // Item Type <> Subtotal & Discount
        ssFilters.push({ "name": "type", join: "item", "operator": "noneof", "values": ['Subtotal', 'Discount'] });
        const SS_PI_FOR_GEN_SA_LINE = 'customsearch_ss_pi_for_gen_sa_line';
        let ssResults = libCode.loadSavedSearch(null, SS_PI_FOR_GEN_SA_LINE, ssFilters, []);
        //console.log({ ssResults: ssResults.length });
        log.debug(SS_PI_FOR_GEN_SA_LINE, { ss_length: ssResults.length, ssFilters: ssFilters });
        // ssResults.forEach(function (row) {
        //     let internalid = row.getValue({ "name": "internalid", "label": "PI Internal ID" });
        //     let tranid = row.getValue({ "name": "tranid", "label": "PI No." });
        //     let trandate = row.getValue({ "name": "trandate", "label": "PI Date" });
        //     let subsidiarynohierarchy = row.getValue({ "name": "subsidiarynohierarchy", "label": "Subsidiary" });
        //     let entity = row.getValue({ "name": "entity", "label": "Customer" });
        //     let entityid = row.getValue({ "name": "entityid", "join": "customerMain", "label": "Customer Code" });
        //     let companyname = row.getValue({ "name": "companyname", "join": "customerMain", "label": "Customer Name" });
        //     let currency = row.getValue({ "name": "currency", "label": "Currency" });
        //     let custbody_payment_terms = row.getValue({ "name": "custbody_payment_terms", "label": "Payment Terms" });
        //     let custbody_incoterms = row.getValue({ "name": "custbody_incoterms", "label": "Incoterms" });
        //     let item = row.getValue({ "name": "item", "label": "Item Code" });
        //     let displayname = row.getValue({ "name": "displayname", "join": "item", "label": "Item Name " });
        //     let unit = row.getValue({ "name": "unit", "label": "Sales Unit" });
        //     let quantityuom = row.getValue({ "name": "quantityuom", "label": "Quantity" });
        //     let fxrate = row.getValue({ "name": "fxrate", "label": "Unit Price" });
        //     let fxamount = row.getValue({ "name": "fxamount", "label": "Amount" });
        //     let taxcode = row.getValue({ "name": "taxcode", "label": "Tax Code" });
        //     let taxamount = row.getValue({ "name": "taxamount", "label": "Tax Amt" });
        //     let grossamount = row.getValue({ "name": "grossamount", "label": "Gross Amount" });
        // });
        return ssResults;
    }
    /**
     * - SEARCH ID : customsearch_ss_so_subtotal_discount
     * - SEARCH Title : SS - SO Subtotal&Discount
     *
     * @example
     * let soId = '1997859';
     * let result = loadSOSubtotalDiscount(soId);
     */
    function loadSOSubtotalDiscount(soId) {
        let result = { subtotal: {}, discount: [], discountPct: 0 };
        try {
            let ssFilters = [];
            ssFilters.push({ "name": "internalid", "operator": "is", "values": soId });
            const SS_SO_SUBTOTAL_DISCOUNT = 'customsearch_ss_so_subtotal_discount';
            let ssResults = libCode.loadSavedSearch(null, SS_SO_SUBTOTAL_DISCOUNT, ssFilters, []);
            log.debug(SS_SO_SUBTOTAL_DISCOUNT, { ss_length: ssResults.length, ssFilters: ssFilters });
            ssResults.forEach(function (row) {
                let internalid = row.getValue({ "name": "internalid", "label": "Internal ID" });
                let tranid = row.getValue({ "name": "tranid", "label": "Document Number" });
                let item = row.getValue({ "name": "item", "label": "Item" });
                let quantity = row.getValue({ "name": "quantity", "label": "Quantity" });
                let amount = row.getValue({ "name": "amount", "label": "Amount" });
                let type = row.getValue({ "name": "type", "label": "Type", "join": "item" });
                let pricelevel = row.getValue({ "name": "pricelevel", "label": "Price Level" });
                let taxcode = row.getValue({ "name": "taxcode", "label": "Tax Code" });
                let location = row.getValue({ "name": "location", "label": "Location" });
                let custcol_promotion_ordercode1 = row.getValue({ "name": "custcol_promotion_ordercode1", "label": "Promotion Order Code 1" });
                let custcol_promotion_orderamt1 = row.getValue({ "name": "custcol_promotion_orderamt1", "label": "Promotion Order Amount 1" });
                let rowData = { internalid, tranid, item, quantity, amount, type, pricelevel, taxcode, location, custcol_promotion_ordercode1, custcol_promotion_orderamt1 };
                if (type === 'Subtotal') {
                    result.subtotal = rowData;
                }
                else if (type === 'Discount') {
                    result.discount.push(rowData);
                }
            });
            var totalDiscount = result.discount.reduce(function (sum, disc) {
                return sum + (Number(disc.amount) || 0);
            }, 0);
            var totalSubtotal = Number(result.subtotal.amount) || 0;
            result.discount.forEach(function (disc) {
                var discAmount = Number(disc.amount) || 0;
                disc.weight = totalSubtotal !== 0 ? (discAmount / totalSubtotal) : 0;
                disc.weightPct = disc.weight * 100;
            });
            result.discountPct = (totalDiscount / totalSubtotal) * 100;
        }
        catch (error) {
            log.error({
                title: 'loadSOSubtotalDiscount Error',
                details: { soId: soId, error: libCode.getErrorMessage(error) }
            });
        }
        return result;
    }
    /**
     * load Location For Selection Field
     * - Search ID : customsearch_ss_sa_loaction_script
     * - use cache
     * @returns
     */
    function loadLocationLoadingPlace() {
        try {
            const SS_SA_LOACTION_SCRIPT = 'customsearch_ss_sa_loaction_script';
            // check cache 
            let results = CacheUtilModule.read(SS_SA_LOACTION_SCRIPT);
            if (!!results) {
                return results;
            }
            let ssFilters = [];
            // Loading Place
            ssFilters.push({ "name": "custrecord_da_loadingplace", join: null, "operator": "is", "values": true });
            let ssResults = libCode.loadSavedSearch(null, SS_SA_LOACTION_SCRIPT, ssFilters, []);
            //console.log({ ssResults: ssResults.length });
            log.debug(SS_SA_LOACTION_SCRIPT, { ss_length: ssResults.length, ssFilters: ssFilters });
            let resultsArr = ssResults.map(function (row) {
                let internalid = row.getValue({ "name": "internalid", "label": "Internal ID" });
                let name = row.getValue({ "name": "name", "label": "Name" });
                let custrecord_da_loadingplace = row.getValue({ "name": "custrecord_da_loadingplace", "label": "Loading Place" });
                return {
                    name,
                    internalid,
                    loading_place: custrecord_da_loadingplace
                };
            });
            // create cache 
            if (resultsArr.length > 0) {
                CacheUtilModule.create('customsearch_ss_sa_loaction_script', resultsArr);
            }
            return resultsArr;
        }
        catch (error) {
            log.error('loadLocationLoadingPlace', error);
            return [];
        }
    }
    function getCustomerAddressObject(cus_id) {
        var cus_rec = record.load({ type: 'customer', id: cus_id });
        var customerAddress = {};
        customerAddress['CUSTOMER_ADDRESS'] = [];
        customerAddress['CUSTOMER_ADDRESS_MAP'] = {};
        customerAddress['ADDRESS_MAP'] = {};
        var line_count = Number(cus_rec.getLineCount('addressbook'));
        var shipping_master_data = {};
        var shipping_master_list = [];
        // for (var i = 0; i < line_count; i++) {
        //     var addressSubrecord = cus_rec.getSublistSubrecord({
        //         sublistId: 'addressbook',
        //         fieldId: 'addressbookaddress',
        //         line: i
        //     });
        //     var custrecord_exp_shipmasteraddress = addressSubrecord.getValue({
        //         fieldId: 'custrecord_exp_shipmasteraddress'
        //     })
        //     if (shipping_master_list.indexOf(custrecord_exp_shipmasteraddress) == -1) {
        //         shipping_master_list.push(custrecord_exp_shipmasteraddress);
        //     }
        // }
        // var shipping_master_data = getShippingMasterObject(shipping_master_list);
        var line_count = Number(cus_rec.getLineCount('addressbook'));
        for (var i = 0; i < line_count; i++) {
            var data = {};
            data['defaultshipping'] = cus_rec.getSublistValue('addressbook', 'defaultshipping', i);
            data['defaultbilling'] = cus_rec.getSublistValue('addressbook', 'defaultbilling', i);
            data['addressbookaddress'] = cus_rec.getSublistValue('addressbook', 'addressbookaddress', i);
            data['addressbookaddress_text'] = cus_rec.getSublistValue('addressbook', 'addressbookaddress_text', i);
            data['id'] = cus_rec.getSublistValue('addressbook', 'id', i);
            data['label'] = cus_rec.getSublistValue('addressbook', 'label', i);
            let addressSubrecord = cus_rec.getSublistSubrecord({ sublistId: 'addressbook', fieldId: 'addressbookaddress', line: i });
            let custrecord_exp_shipmasteraddress = addressSubrecord.getValue({ fieldId: 'custrecord_exp_shipmasteraddress' });
            data['custrecord_consignee_name'] = addressSubrecord.getValue({ fieldId: 'custrecord_consignee_name' });
            data['custrecord_consignee_addr'] = addressSubrecord.getValue({ fieldId: 'custrecord_consignee_addr' });
            data['custrecord_notifyparty_addr'] = addressSubrecord.getValue({ fieldId: 'custrecord_notifyparty_addr' });
            data['custrecord_notifyparty_name'] = addressSubrecord.getValue({ fieldId: 'custrecord_notifyparty_name' });
            data['custrecord_consignee_tel'] = addressSubrecord.getValue({ fieldId: 'custrecord_consignee_tel' });
            data['custrecord_consignee_email'] = addressSubrecord.getValue({ fieldId: 'custrecord_consignee_email' });
            data['custrecord_notifyparty_tel'] = addressSubrecord.getValue({ fieldId: 'custrecord_notifyparty_tel' });
            data['custrecord_consignee_email'] = addressSubrecord.getValue({ fieldId: 'custrecord_consignee_email' });
            data['custrecord_exp_shipmasteraddress'] = custrecord_exp_shipmasteraddress;
            log.debug({
                title: 'addressSubrecord',
                details: addressSubrecord
            });
            // for (var key in shipping_master_data[custrecord_exp_shipmasteraddress]) {
            //     data[key] = shipping_master_data[custrecord_exp_shipmasteraddress][key];
            // }
            customerAddress['CUSTOMER_ADDRESS'].push(data);
            customerAddress['CUSTOMER_ADDRESS_MAP'][data['id']] = data;
            customerAddress['ADDRESS_MAP'][data['addressbookaddress']] = data['id'].toString();
        }
        return customerAddress;
    }
    /**
     *
     * - SEARCH ID : customsearch_ss_sa_remaining_qty
     * - SEARCH Title : SS - Shipping Advice Remaining Qty (Export)
     *
    @example
    let internalid = '218863,220419'; // Internal ID
    
    let resultsSaRemainingQty = loadSSSaRemainingQty(internalid);
    
     */
    function loadSSSARemainingQty(internalid) {
        let ssFilters = [];
        // Internal ID
        ssFilters.push({ "name": "custbody_ex_ref_pi", "operator": "is", "values": internalid });
        const SS_SA_REMAINING_QTY = 'customsearch_ss_sa_remaining_qty';
        let ssResults = libCode.loadSavedSearch(null, SS_SA_REMAINING_QTY, ssFilters, []);
        //console.log({ ssResults: ssResults.length });
        log.debug(SS_SA_REMAINING_QTY, { ss_length: ssResults.length, ssFilters: ssFilters });
        let resultsSARemainingQtyData = {};
        ssResults.forEach(function (row) {
            // let internalid = row.getValue({ "name": "internalid", "label": "Internal ID" });
            // let tranid = row.getValue({ "name": "tranid", "label": "Document Number" });
            // let trandate = row.getValue({ "name": "trandate", "label": "Date" });
            // let cseg_dom_exp = row.getValue({ "name": "cseg_dom_exp", "label": "Domestic/Export_" });
            // let subsidiarynohierarchy = row.getValue({ "name": "subsidiarynohierarchy", "label": "Subsidiary (no hierarchy)" });
            // let currency = row.getValue({ "name": "currency", "label": "Currency" });
            // let entity = row.getValue({ "name": "entity", "label": "Sold to Customer" });
            // let custbody_ship_to_customer = row.getValue({ "name": "custbody_ship_to_customer", "label": "Ship to Customer" });
            // let custbody_payment_terms = row.getValue({ "name": "custbody_payment_terms", "label": "Payment Terms" });
            // let custbody_incoterms = row.getValue({ "name": "custbody_incoterms", "label": "Incoterms (c)" });
            // let cseg_sale_channel = row.getValue({ "name": "cseg_sale_channel", "label": "Sale Channel" });
            // let cseg_dist_chanl = row.getValue({ "name": "cseg_dist_chanl", "label": "Distribution Channel" });
            // let custbody_ship_from_country = row.getValue({ "name": "custbody_ship_from_country", "label": "Ship from Country" });
            // let custbody_ship_to_country = row.getValue({ "name": "custbody_ship_to_country", "label": "Ship to Country" });
            // let custbody_port = row.getValue({ "name": "custbody_port", "label": "Port" });
            // let shipdate = row.getValue({ "name": "shipdate", "label": "ETD Date" });
            // let custbody_ex_eta_date = row.getValue({ "name": "custbody_ex_eta_date", "label": "ETA Date" });
            // let item = row.getValue({ "name": "item", "label": "Item" });
            // let itemid = row.getValue({ "name": "itemid", "label": "Name", "join": "item" });
            // let displayname = row.getValue({ "name": "displayname", "label": "Display Name", "join": "item" });
            // let quantityuom = row.getValue({ "name": "quantityuom", "label": "Quantity" });
            let custcol_ex_qty_confirm = row.getValue({ "name": "custcol_ex_qty_confirm", "label": "Qty (Confirm)" }) || 0;
            let custbody_ex_ref_pi = row.getValue({ "name": "custbody_ex_ref_pi", "label": "Ref. Proforma Invoice" });
            // let unit = row.getValue({ "name": "unit", "label": "Units" });
            // let custcol_net_weight = row.getValue({ "name": "custcol_net_weight", "label": "Net Weight" });
            // let custcol_gross_weight = row.getValue({ "name": "custcol_gross_weight", "label": "Gross Weight" });
            // let line = row.getValue({ "name": "line", "label": "Line ID" });
            let custcol_pi_line_id = row.getValue({ "name": "custcol_pi_line_id", "label": "PI Line ID" });
            let keys = custbody_ex_ref_pi + '_' + custcol_pi_line_id;
            if (resultsSARemainingQtyData[keys] === undefined) {
                resultsSARemainingQtyData[keys] = {
                    custcol_ex_qty_confirm: Number(custcol_ex_qty_confirm)
                };
            }
        });
        return resultsSARemainingQtyData;
    }
    /**
     * Class representing a custom wrapper around NetSuite's UI Form.
     * This class simplifies creating Suitelet forms with field tracking capabilities.
     *
     * @example
     * // Example 1: Basic usage
     * const customForm = new ClassCustomForm({ title: 'Generate Shipping Advice', hideNavBar: false });
     * customForm.addField({
     *   id: 'custpage_customer_name',
     *   type: ui.FieldType.TEXT,
     *   label: 'Customer Name',
     * });
     * const form = customForm.getForm();
     * response.writePage(form);
     *
     * @example
     * // Example 2: Retrieve added field IDs
     * const fieldIds = customForm.getAllFields();
     * log.debug('Fields added:', fieldIds);
     */
    class ClassCustomForm {
        form;
        fieldList = [];
        /**
         * Creates a new form wrapper.
         *
         * @param {Object} params - Configuration for the form.
         * @param {string} params.title - The title displayed on the form.
         * @param {boolean} [params.hideNavBar] - Whether to hide the navigation bar (optional).
         */
        constructor(params) {
            this.form = ui.createForm(params);
        }
        /**
         * Adds a new field to the form and keeps track of its ID.
         *
         * @param {ui.AddFieldOptions} params - Options for adding the field.
         * @returns {ui.Field} The created field instance.
         */
        addField(params) {
            try {
                const field = this.form.addField(params);
                this.fieldList.push(params.id);
                return field;
            }
            catch (error) {
                log.error({ title: 'Error adding field', details: { field: params, error } });
                throw { ...error, field: params };
            }
        }
        /**
         * Retrieves a list of all field IDs that were added to this form.
         *
         * @returns {string[]} An array containing the IDs of all added fields.
         */
        getAllFields() {
            return this.fieldList;
        }
        /**
         * Returns the underlying NetSuite UI Form instance.
         *
         * @returns {ui.Form} The original NetSuite form object.
         */
        getForm() {
            return this.form;
        }
    }
    /**
     * Upload a file to NetSuite File Cabinet and return status
     *
     * @param uploadedFile - Uploaded file object from request.files
     * @param folderId - Folder internal ID where file will be saved
     * @returns UploadResult - status of upload
     */
    function uploadFileToFolder(uploadedFile, folderId) {
        try {
            // ✅ Validation
            if (!uploadedFile) {
                return { success: false, message: 'File object is required.' };
            }
            if (!folderId) {
                return { success: false, message: 'Folder ID is required.' };
            }
            // ✅ Create file in File Cabinet
            const fileObj = file.create({
                name: uploadedFile.name,
                fileType: uploadedFile.fileType || file.Type.PLAINTEXT,
                contents: uploadedFile.getContents(),
                folder: folderId,
            });
            const fileId = fileObj.save();
            log.audit({
                title: 'File saved successfully',
                details: { name: uploadedFile.name, folderId, fileId },
            });
            // ✅ Return success status
            return {
                success: true,
                fileId,
                fileName: uploadedFile.name,
                message: 'File uploaded successfully.',
            };
        }
        catch (error) {
            log.error({
                title: 'File upload failed',
                details: error.message || error,
            });
            // ❌ Return error status
            return {
                success: false,
                message: `Upload failed: ${error.message || error}`,
                fileName: uploadedFile?.name,
            };
        }
    }
    /*========================================= Utility ==============================*/
    /**
     * Cache Utility Module (IIFE)
     * ใช้สำหรับ CRUD ข้อมูลใน N/cache แบบง่ายและปลอดภัย
     *
     * รองรับ:
     * - create
     * - update
     * - read
     * - delete/remove
     * - refresh (reload ใหม่จาก loader function)
     *
     * @example
    // สร้าง cache
    CacheUtilModule.create('user_count', { total: 10 }, 600);
    
    // อ่าน cache
    const data = CacheUtilModule.read('user_count');
    
    // ลบ cache
    CacheUtilModule.remove('user_count');
    
    // Refresh cache แบบ force
    CacheUtilModule.refresh('user_count', () => {
        return { total: Math.floor(Math.random() * 100) };
    });
     */
    const CacheUtilModule = (function () {
        const CACHE_NAME = 'shared_global_cache';
        // const mainCache = cache.getCache({ name: CACHE_NAME });
        const TTL = 3600; // 1 hour
        function getCache() {
            return cache.getCache({ name: CACHE_NAME });
        }
        /**
         * สร้างหรืออัปเดตค่าลง cache
         *
         * @function createOrUpdate
         * @param {string} key - ชื่อ key ใน cache
         * @param {*} value - ข้อมูลที่จะเก็บ (object จะถูก JSON.stringify ให้อัตโนมัติ)
         * @param {number} [ttl=900] - อายุของ cache (หน่วยเป็นวินาที) ต้อง >= 300
         * - 3600 = 1 ชั่วโมง
         * - 900 = 15 นาที
         * @returns {boolean} คืนค่า true เมื่อสำเร็จ
         */
        function createOrUpdate(key, value, ttl = TTL) {
            try {
                if (ttl < 300)
                    ttl = 300;
                const data = typeof value === 'object' ? JSON.stringify(value) : String(value);
                const mainCache = getCache();
                mainCache.put({ key, value: data, ttl });
                log.debug('CACHE PUT', `Saved key: ${key}, ttl: ${ttl / 60} minutes`);
                return true;
            }
            catch (e) {
                log.error('CACHE PUT ERROR', e);
                return false;
            }
        }
        /**
         * อ่านค่าจาก cache ตาม key
         *
         * @function read
         * @template T
         * @param {string} key - ชื่อ key
         * @returns {T | null} ถ้ามีจะคืนค่าเดิม (แปลง JSON ให้), ถ้าไม่มีคืน null
         */
        function read(key) {
            try {
                const mainCache = getCache();
                const raw = mainCache.get({ key });
                if (!raw)
                    return null;
                log.debug('CACHE READ', `Read key: ${key}, value: ${!!raw}`);
                try {
                    return JSON.parse(raw);
                }
                catch {
                    return raw;
                }
            }
            catch (e) {
                log.error('CACHE READ ERROR', e);
                return null;
            }
        }
        /**
         * ลบค่าออกจาก cache ตาม key
         *
         * @function remove
         * @param {string} key - key ที่ต้องการลบ
         * @returns {boolean} true เมื่อสำเร็จ
         */
        function remove(key) {
            try {
                const mainCache = getCache();
                mainCache.remove({ key });
                log.debug('CACHE REMOVE', `Removed key: ${key}`);
                return true;
            }
            catch (e) {
                log.error('CACHE REMOVE ERROR', e);
                return false;
            }
        }
        /**
         * รีเฟรชข้อมูลใน cache (โหลดใหม่ด้วย loaderFn)
         *
         * @function refresh
         * @template T
         * @param {string} key - key ใน cache
         * @param {() => T} loaderFn - ฟังก์ชันไว้สร้างข้อมูลใหม่
         * @param {number} [ttl=900] - อายุ cache
         * @returns {T | null} ข้อมูลใหม่ที่บันทึก หรือ null เมื่อ error
         */
        function refresh(key, loaderFn, ttl = TTL) {
            try {
                const newValue = loaderFn();
                createOrUpdate(key, newValue, ttl);
                log.debug('CACHE REFRESH', `Refreshed key: ${key}`);
                return newValue;
            }
            catch (e) {
                log.error('CACHE REFRESH ERROR', e);
                return null;
            }
        }
        /**
         * Object ที่ export ออกไปใช้ภายนอก
         */
        return {
            /** @see createOrUpdate */
            create: createOrUpdate,
            /** @see createOrUpdate */
            update: createOrUpdate,
            /** @see read */
            read,
            /** @see remove */
            delete: remove,
            /** @see remove */
            remove,
            /** @see refresh */
            refresh
        };
    })();
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
    /*========================================= Shipping Advice Email Module ==============================*/
    const ShippingAdviceEmailModule = (function () {
        // ============================================================
        // CONFIG
        // ============================================================
        const SENDER_EMPLOYEE_ID = 100856; // Double A (oh_team@doublea1991.com)
        // ============================================================
        // PUBLIC : Send Shipping Advice Confirmed Email
        // ============================================================
        /**
         * @param {number|string} recid - Sales Order Internal ID
         */
        function sendConfirmedEmail(recid) {
            log.debug('SA Email [Step 0]', 'sendConfirmedEmail START. recid=' + recid);
            // 1) Skip if already sent (prevent duplicate)
            let soLookup;
            try {
                soLookup = search.lookupFields({
                    type: search.Type.SALES_ORDER,
                    id: recid,
                    columns: ['custbody_sa_email_sent']
                });
                log.debug('SA Email [Step 1]', 'lookupFields OK: ' + JSON.stringify(soLookup));
            }
            catch (e1) {
                throw new Error('Step 1 (lookupFields custbody_sa_email_sent) FAILED: ' + (e1.message || e1));
            }
            if (soLookup.custbody_sa_email_sent === true) {
                log.audit('SA Email', 'Already sent. Skip. SO ID: ' + recid);
                return;
            }
            // 2) Get recipient employees
            let recipientIds;
            try {
                recipientIds = getRecipientEmployeeIds();
                log.debug('SA Email [Step 2]', 'Recipients count: ' + (recipientIds ? recipientIds.length : 0) + ', IDs: ' + JSON.stringify(recipientIds));
            }
            catch (e2) {
                throw new Error('Step 2 (getRecipientEmployeeIds) FAILED: ' + (e2.message || e2));
            }
            if (!recipientIds || recipientIds.length === 0) {
                log.error('SA Email', 'No recipients found (no Employee with custentity_receive_email = T)');
                return;
            }
            // 3) Build email content
            let data, subject, htmlBody;
            try {
                data = getEmailData(recid);
                log.debug('SA Email [Step 3a]', 'getEmailData OK. tranid=' + data.tranid + ', items count=' + data.items.length);
            }
            catch (e3a) {
                throw new Error('Step 3a (getEmailData) FAILED: ' + (e3a.message || e3a));
            }
            try {
                subject = 'Shipping Advice Confirmed : ' + data.tranid;
                htmlBody = buildHtmlBody(data);
                log.debug('SA Email [Step 3b]', 'buildHtmlBody OK. body length=' + htmlBody.length);
            }
            catch (e3b) {
                throw new Error('Step 3b (buildHtmlBody) FAILED: ' + (e3b.message || e3b));
            }
            // 4) Send email
            try {
                email.send({
                    author: SENDER_EMPLOYEE_ID,
                    recipients: recipientIds,
                    subject: subject,
                    body: htmlBody,
                    relatedRecords: {
                        transactionId: parseInt(recid, 10)
                    }
                });
                log.debug('SA Email [Step 4]', 'email.send OK');
            }
            catch (e4) {
                throw new Error('Step 4 (email.send) FAILED: author=' + SENDER_EMPLOYEE_ID + ', recipients=' + JSON.stringify(recipientIds) + ', error=' + (e4.message || e4));
            }
            // 5) Update flags (prevent duplicate + audit trail)
            try {
                record.submitFields({
                    type: record.Type.SALES_ORDER,
                    id: recid,
                    values: {
                        custbody_sa_email_sent: true,
                        custbody_sa_email_sent_date: new Date()
                    },
                    options: { ignoreMandatoryFields: true, enableSourcing: false }
                });
                log.debug('SA Email [Step 5]', 'Update flags OK');
            }
            catch (e5) {
                throw new Error('Step 5 (submitFields email_sent flag) FAILED: ' + (e5.message || e5));
            }
            log.audit('SA Email', 'Sent OK. SO ID: ' + recid + ', Recipients: ' + recipientIds.length);
        }
        // ============================================================
        // PRIVATE : Get list of Employee Internal IDs (recipients)
        // ============================================================
        function getRecipientEmployeeIds() {
            const ids = [];
            search.create({
                type: search.Type.EMPLOYEE,
                filters: [
                    ['custentity_receive_email', 'is', 'T'],
                    'AND', ['isinactive', 'is', 'F'],
                    'AND', ['email', 'isnotempty', '']
                ],
                columns: ['internalid', 'email']
            }).run().each(function (result) {
                ids.push(result.id);
                return true;
            });
            return ids;
        }
        // ============================================================
        // PRIVATE : Get header + line item data from Sales Order
        // Uses Record API (record.load) instead of Saved Search to avoid
        // saved-search column/join compatibility issues with Custom Segments.
        // ============================================================
        function getEmailData(recid) {
            // ----- 3a.1 Load SO record -----
            let so;
            try {
                so = record.load({
                    type: record.Type.SALES_ORDER,
                    id: recid
                });
                log.debug('SA Email [Step 3a.1]', 'record.load OK');
            }
            catch (eLoad) {
                throw new Error('getEmailData[record.load]: ' + (eLoad.message || eLoad));
            }
            // ----- 3a.2 Build header data -----
            let data;
            try {
                data = {
                    tranid: so.getValue('tranid') || '',
                    pi_no: stripRecordPrefix(so.getText('custbody_ex_ref_pi') || so.getValue('custbody_ex_ref_pi') || ''),
                    customer_name: so.getText('entity') || '',
                    etd_date: so.getText('shipdate') || '',
                    eta_date: so.getText('custbody_ex_eta_date') || '',
                    port: so.getText('custbody_port') || '',
                    po_number: so.getValue('otherrefnum') || '',
                    booking_no: so.getValue('custbody_ex_booking_no') || '',
                    feeder_vessel_name: so.getValue('custbody_ex_feedervesselname') || '',
                    pickup_date: so.getText('custbody_ex_pickup_date') || '',
                    first_return_date: so.getText('custbody_ex_first_return_date') || '',
                    closing_date: so.getText('custbody_ex_closing_date') || '',
                    closing_time: toTime24(so.getText('custbody_ex_closing_time') || so.getValue('custbody_ex_closing_time') || ''),
                    vgm_cutoff_date: so.getText('custbody_ex_vgmcutoff_date') || '',
                    vgm_cutoff_time: toTime24(so.getText('custbody_ex_vgmcutoff_time') || so.getValue('custbody_ex_vgmcutoff_time') || ''),
                    special_loading: so.getValue('custbody_ex_special_loading') || '',
                    items: []
                };
                log.debug('SA Email [Step 3a.2]', 'header OK: tranid=' + data.tranid);
            }
            catch (eHdr) {
                throw new Error('getEmailData[header]: ' + (eHdr.message || eHdr));
            }
            // ----- 3a.3 Iterate item sublist & read line fields via record API -----
            const itemIdsForLookup = []; // collect itemIds to batch-lookup Paper Size later
            const tempItems = [];
            try {
                const lineCount = so.getLineCount({ sublistId: 'item' });
                log.debug('SA Email [Step 3a.3]', 'Line count: ' + lineCount);
                for (let i = 0; i < lineCount; i++) {
                    const itemType = readSublist(so, 'itemtype', i, '');
                    if (itemType === 'Discount' || itemType === 'Subtotal')
                        continue;
                    const itemId = readSublist(so, 'item', i, '');
                    const row = {
                        item: readSublistText(so, 'item', i, '') || itemId,
                        display_name: '',
                        quantity: Number(readSublist(so, 'quantity', i, 0)) || 0,
                        sales_unit: readSublistText(so, 'units', i, ''),
                        grade: readSublistText(so, 'cseg_item_grade', i, '') || readSublist(so, 'cseg_item_grade', i, ''),
                        gram: readSublistText(so, 'cseg_item_gram', i, '') || readSublist(so, 'cseg_item_gram', i, ''),
                        brand: readSublistText(so, 'cseg_item_brand', i, '') || readSublist(so, 'cseg_item_brand', i, ''),
                        paper_size: '', // populated from item record below
                        net_weight: Number(readSublist(so, 'custcol_net_weight', i, 0)) || 0,
                        gross_weight: Number(readSublist(so, 'custcol_gross_weight', i, 0)) || 0,
                        _itemId: itemId
                    };
                    if (itemId && itemIdsForLookup.indexOf(itemId) === -1) {
                        itemIdsForLookup.push(itemId);
                    }
                    tempItems.push(row);
                }
                log.debug('SA Email [Step 3a.3]', 'Lines collected: ' + tempItems.length + ', Unique items: ' + itemIdsForLookup.length);
            }
            catch (eLoop) {
                throw new Error('getEmailData[sublist-loop]: ' + (eLoop.message || eLoop));
            }
            // ----- 3a.4 Batch lookup Paper Size + Grade from Item Record -----
            // Grade (cseg_item_grade) is a custom segment on the Item record, NOT on the
            // transaction line — must be read from the item record like Paper Size.
            const itemPaperSizeMap = {};
            const itemGradeMap = {};
            // Helper: extract display text from a lookupFields result value (array of {value,text} or string)
            function extractLookupText(v) {
                if (Array.isArray(v) && v.length > 0) {
                    return v[0].text || v[0].value || '';
                }
                else if (typeof v === 'string') {
                    return v;
                }
                return '';
            }
            try {
                for (let k = 0; k < itemIdsForLookup.length; k++) {
                    const iid = itemIdsForLookup[k];
                    try {
                        const itemLookup = search.lookupFields({
                            type: 'item',
                            id: iid,
                            columns: ['custitem_infor_paper_size', 'cseg_item_grade']
                        });
                        itemPaperSizeMap[iid] = extractLookupText(itemLookup.custitem_infor_paper_size);
                        itemGradeMap[iid] = extractLookupText(itemLookup.cseg_item_grade);
                    }
                    catch (eItemLookup) {
                        log.error('SA Email [Step 3a.4]', 'Lookup paper_size/grade for item ' + iid + ' failed: ' + (eItemLookup.message || eItemLookup));
                        itemPaperSizeMap[iid] = '';
                        itemGradeMap[iid] = '';
                    }
                }
                log.debug('SA Email [Step 3a.4]', 'Paper Size map: ' + JSON.stringify(itemPaperSizeMap) + ' | Grade map: ' + JSON.stringify(itemGradeMap));
            }
            catch (eLookup) {
                throw new Error('getEmailData[item-lookup]: ' + (eLookup.message || eLookup));
            }
            // Merge paper_size + grade + finalize items
            tempItems.forEach(function (row) {
                row.paper_size = itemPaperSizeMap[row._itemId] || '';
                // Prefer Grade from the item record; fall back to any line-level value already read
                row.grade = itemGradeMap[row._itemId] || row.grade || '';
                delete row._itemId;
                data.items.push(row);
            });
            log.debug('SA Email [Step 3a.5]', 'Final items count: ' + data.items.length);
            return data;
        }
        // Helper: strip the record-type prefix from a getText() of a record/list field.
        // e.g. "Sales Order #PI-US-TH-DA-26040025" -> "PI-US-TH-DA-26040025"
        function stripRecordPrefix(s) {
            if (!s)
                return '';
            const str = String(s).trim();
            const hashIdx = str.lastIndexOf('#');
            return (hashIdx >= 0) ? str.substring(hashIdx + 1).trim() : str;
        }
        // Helper: convert a 12-hour time string ("12:00 pm", "1:30 PM") to 24-hour ("12:00", "13:30").
        // Returns the input unchanged if it doesn't match the expected pattern.
        function toTime24(s) {
            if (!s)
                return '';
            const str = String(s).trim();
            const m = str.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
            if (!m)
                return str;
            let h = parseInt(m[1], 10);
            const min = m[2];
            const ap = m[3] ? m[3].toLowerCase() : '';
            if (ap === 'am') {
                if (h === 12)
                    h = 0;
            }
            else if (ap === 'pm') {
                if (h !== 12)
                    h += 12;
            }
            return (h < 10 ? '0' + h : String(h)) + ':' + min;
        }
        // Helpers: safely read sublist values (return default on error)
        function readSublist(rec, fieldId, line, defaultVal) {
            try {
                const v = rec.getSublistValue({ sublistId: 'item', fieldId: fieldId, line: line });
                return (v === null || v === undefined) ? defaultVal : v;
            }
            catch (e) {
                return defaultVal;
            }
        }
        function readSublistText(rec, fieldId, line, defaultVal) {
            try {
                const v = rec.getSublistText({ sublistId: 'item', fieldId: fieldId, line: line });
                return (v === null || v === undefined) ? defaultVal : v;
            }
            catch (e) {
                return defaultVal;
            }
        }
        // ============================================================
        // PRIVATE : Build HTML body (responsive, branded, email-safe CSS)
        // ============================================================
        function buildHtmlBody(data) {
            let itemRows = '';
            data.items.forEach(function (item, idx) {
                itemRows += '<tr>'
                    + '<td style="text-align:center;">' + (idx + 1) + '</td>'
                    + '<td>' + esc(item.item) + '</td>'
                    + '<td style="text-align:right;">' + fmtNum(item.quantity) + '</td>'
                    + '<td style="text-align:center;">' + esc(item.sales_unit) + '</td>'
                    + '<td>' + esc(item.grade) + '</td>'
                    + '<td style="text-align:right;">' + esc(item.gram) + '</td>'
                    + '<td>' + esc(item.brand) + '</td>'
                    + '<td>' + esc(item.paper_size) + '</td>'
                    + '<td style="text-align:right;">' + fmtNum(item.net_weight) + '</td>'
                    + '<td style="text-align:right;">' + fmtNum(item.gross_weight) + '</td>'
                    + '</tr>';
            });
            return ''
                + '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
                + 'body{font-family:"Segoe UI",Arial,sans-serif;color:#333;background:#f4f6f8;margin:0;padding:20px;}'
                + '.container{max-width:960px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);}'
                + '.header{background:#1F4E78;color:#fff;padding:24px 30px;}'
                + '.header h1{margin:0;font-size:22px;}'
                + '.header p{margin:4px 0 0;opacity:0.85;font-size:13px;}'
                + '.content{padding:24px 30px;}'
                + '.badge{display:inline-block;background:#28a745;color:#fff;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:bold;letter-spacing:0.5px;}'
                + 'table.info{width:100%;border-collapse:collapse;margin:20px 0;}'
                + 'table.info td{padding:9px 12px;border-bottom:1px solid #e8eaed;font-size:14px;}'
                + 'table.info td.lbl{background:#f1f3f5;font-weight:600;width:30%;color:#555;}'
                + 'h3{color:#1F4E78;margin-top:28px;border-left:4px solid #2E75B6;padding-left:10px;}'
                + 'table.items{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;}'
                + 'table.items th{background:#1F4E78;color:#fff;padding:10px 8px;text-align:left;font-weight:600;}'
                + 'table.items td{padding:8px;border-bottom:1px solid #e8eaed;}'
                + 'table.items tr:nth-child(even) td{background:#f9fafb;}'
                + '.footer{padding:16px 30px;background:#f1f3f5;color:#888;font-size:12px;text-align:center;}'
                + '</style></head><body>'
                + '<div class="container">'
                + '<div class="header"><h1>Shipping Advice Confirmed</h1><p>Automated notification from NetSuite</p></div>'
                + '<div class="content">'
                + '<p>Dear Team,</p>'
                + '<p>The following Shipping Advice has been <span class="badge">CONFIRMED</span> and is ready for processing:</p>'
                + '<table class="info">'
                + '<tr><td class="lbl">Shipping Advice No.</td><td><strong>' + esc(data.tranid) + '</strong></td></tr>'
                + '<tr><td class="lbl">PI No.</td><td>' + esc(data.pi_no) + '</td></tr>'
                + '<tr><td class="lbl">Customer</td><td>' + esc(data.customer_name) + '</td></tr>'
                + '<tr><td class="lbl">ETD Date</td><td>' + esc(data.etd_date) + '</td></tr>'
                + '<tr><td class="lbl">ETA Date</td><td>' + esc(data.eta_date) + '</td></tr>'
                + '<tr><td class="lbl">Port</td><td>' + esc(data.port) + '</td></tr>'
                + '<tr><td class="lbl">PO Number</td><td>' + esc(data.po_number) + '</td></tr>'
                + '<tr><td class="lbl">Booking No</td><td>' + esc(data.booking_no) + '</td></tr>'
                + '<tr><td class="lbl">Feeder Vessel Name</td><td>' + esc(data.feeder_vessel_name) + '</td></tr>'
                + '<tr><td class="lbl">Pickup Date</td><td>' + esc(data.pickup_date) + '</td></tr>'
                + '<tr><td class="lbl">First Return Date</td><td>' + esc(data.first_return_date) + '</td></tr>'
                + '<tr><td class="lbl">Closing Date</td><td>' + esc(data.closing_date) + '</td></tr>'
                + '<tr><td class="lbl">Closing Time</td><td>' + esc(data.closing_time) + '</td></tr>'
                + '<tr><td class="lbl">VGM Cut-Off Date</td><td>' + esc(data.vgm_cutoff_date) + '</td></tr>'
                + '<tr><td class="lbl">VGM Cut-Off Time</td><td>' + esc(data.vgm_cutoff_time) + '</td></tr>'
                + '<tr><td class="lbl">Special Loading</td><td>' + esc(data.special_loading) + '</td></tr>'
                + '</table>'
                + '<h3>Item Details</h3>'
                + '<table class="items">'
                + '<thead><tr>'
                + '<th>#</th><th>Item</th><th>Qty</th><th>Unit</th>'
                + '<th>Grade</th><th>Gram</th><th>Brand</th><th>Paper Size</th>'
                + '<th>Net Weight</th><th>Gross Weight</th>'
                + '</tr></thead><tbody>' + itemRows + '</tbody></table>'
                + '</div>'
                + '<div class="footer">This is an automated notification. Please do not reply to this email.<br>Double A (1991) Public Company Limited</div>'
                + '</div></body></html>';
        }
        // ============================================================
        // PRIVATE : HTML escape helper
        // ============================================================
        function esc(str) {
            if (str === null || str === undefined)
                return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
        // ============================================================
        // PRIVATE : Number formatter (thousand separator, max 2 decimals)
        // ============================================================
        function fmtNum(num) {
            const n = Number(num);
            if (isNaN(n))
                return '0';
            return n.toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            });
        }
        // ============================================================
        // EXPORT
        // ============================================================
        return {
            sendConfirmedEmail: sendConfirmedEmail
        };
    })();
    /*========================================= End Shipping Advice Email Module ==============================*/
    //@ts-ignore
    return {
        onRequest
    };
});
