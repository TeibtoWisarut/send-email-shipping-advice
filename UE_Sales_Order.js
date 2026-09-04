/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
var DB_UNITTYPE = {};

define(["N/record", "N/redirect", "N/runtime", "N/format", "N/url", "../Lib/Utility", "../Lib/Libraries Code 2.0.220622", "../Close Sales Order/Lib - Close Sales Order", "../Lib/LibrariesFlashNotification", "../Library/LIB_FieldSalesRep", "../Lib/Constants"],
	/**
	 *
	 * @param {require} require
	 * @param {exports} exports
	 * @param {log} log
	 * @param {record} record
	 * @param {redirect} redirect
	 * @param {runtime} runtime
	 * @param {url} url
	 * @param libUtility
	 * @param {libCode_220622} libCode
	 * @param libSalesOrder
	 * @returns {{beforeLoad: _UE_Sales_Order_BeforeLoad, afterSubmit: _UE_Sales_Order_AfterSubmit}}
	 */
    function (record, redirect, runtime, format, url, libUtility, libCode, libSalesOrder, libFlashNotification, libFieldSalesRep, LibConstants) {
		// "use strict";
		// Object.defineProperty(exports, "__esModule", { value: true });
        /**
         * SuiteScript 2.0 Template - User Event Script
         *
         * @summary User Event Script 2.1 Template
         * Create from TypeScript
         * @author Tanuwong [04/09/2024]<tanuwong@teibto.com>
         *	Name : UE Sales Order
         *	ID : _ue_sales_order
         *
         * @changes 1 : aHR0cHM6Ly90ZWlidG8uc2xhY2suY29tL2FyY2hpdmVzL0QwNUhHUFpBNkxTL3AxNzI1MzMyNjY2Njc1Njc5
         * ************************* ให้ Deplpy Script ไว้หลัง Script Running number **************************
         * spreadsheets : Double A_Revision_Counting_Specification
         * - ทำงานที่ Customer Form ID = 176 : F - Sales Order Form (Export)
         * - ตอนสร้างครั้งเเรก PI Revision No. ให้เท่ากับหยอดเลข Doc No
         * - ถ้าจำนวนเงิน (Total) หรือ Shipping Address หรือ Billing Address เปลี่ยนจะถูกทำการคำนวณเลขที่ Revision
         *
         * @changes 2 : Double A_LTL_Surcharge_Specification
         * Checkbox : No. apply LTL Surcharge = 'Y' ต้องไม่ Vaildate LTL Surchage
         *
         * @changes 3 : Double SalesForce - copy line id so to custom column After Submit [custcol_sf_line_id]
         *
         * ย้าย Script มาจาก : \Close Sales Order\UE Close Sales Order.js
         * @changes Close Sales Order : [18/06/2025]
         * Ref : aHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvMXEtMUtFaHdkRlpjeVdxVEFrN3FNdVBMSGtJWUZEUnJibzFSVzhVNkJwc2cvZWRpdCNnaWQ9MTM5OTgxMzI3
         * - ให้แสดงเฉพาะ Sales Order ไม่ต้องแสดงที่ Shipping Advice (ปุ่มนี้ใช้ทั้ง Domestic และ Export)
         *
         * @changes Select Item Popup : [18/06/2025]
         *
         */
		const FORM_SALES_ORDER_EXPORT = '176';
        var CUSTOMER_PAYMENT_TERMS = {};
		function _UE_Sales_Order_BeforeLoad(scriptContext) {
			const {newRecord: cRecord, form, type, UserEventType} = scriptContext;
			const userId = runtime.getCurrentUser().id;
			// let type = scriptContext.type;
			let execContext = runtime.executionContext;
			let recordId = cRecord.id;
			let recordType = cRecord.type;
			// ============================================

			const targetModes = [scriptContext.UserEventType.VIEW, scriptContext.UserEventType.EDIT];

			// 1. ตรวจสอบโหมด (ทำงานเฉพาะ View และ Edit)
			if (targetModes.includes(type)) {
				// 2. ตรวจสอบเงื่อนไข Checkbox (ID: custbody_is_shippingadvice)
				const newRecord = scriptContext.newRecord;
				const isShippingAdvice = newRecord.getValue({
					fieldId: 'custbody_is_shippingadvice',
				});
				if (isShippingAdvice === true) {
					// 3. เปลี่ยนชื่อหัวจาก Sales Order เป็น Shipping Advice
					form.title = 'Shipping Advice';
				}
			}

			// //################################################################################################
			// // ===== Sales Transaction - Create Container Loading Plan Button
			// //################################################################################################
			try {
				// log.debug('beforeLoad', 'type = ' + type + ' | execContext = ' + execContext);
				if ((type == 'create' || type == 'edit' || type == 'copy' || type == 'view') && execContext == 'USERINTERFACE') {
					const newRecord = scriptContext.newRecord;
					var pi_status = newRecord.getValue('custbody_exp_pi_status');
                    let cseg_dom_exp = newRecord.getValue('cseg_dom_exp');
                    let _is_shippingadvice = newRecord.getValue('custbody_is_shippingadvice');

                    // notof Confirmed Order
                    // is not Shipping Advice (เพราะถ้าเป็น Shipping Advice จะไม่มีปุ่มนี้)
					if ((!_is_shippingadvice) && cseg_dom_exp == 2) { // Export
						var field = form.addField({
							id: 'custpage_bt_container_loading_plan',
							type: 'inlinehtml',
							label: ' ',
						});
						field.updateDisplayType({displayType: 'inline'});
						form.insertField({
							field: field,
							nextfield: 'custbody_exp_insurance',
						});


						if (type == 'view') {
							var suiteletUrl = url.resolveScript({
								scriptId: 'customscript_sl_container_loading_opti',
								deploymentId: 'customdeploy1',
								returnExternalUrl: false,
							});
							suiteletUrl += '&so_id=' + recordId;
							suiteletUrl += '&saleschannel=' + cRecord.getValue('cseg_sale_channel');
							suiteletUrl += '&distchannel=' + cRecord.getValue('cseg_dist_chanl');
							suiteletUrl += '&customer_id=' + cRecord.getValue('entity');
							suiteletUrl += '&shiptocountry=' + cRecord.getValue('custbody_ship_to_country');

							var buttonHtml = `
						<script>
							function openContainerLoadingPlan() {
								window.open('${suiteletUrl}', '_blank');
							}
						</script>
						<style>
							.my-ns-btn {
								background-color: #4CAF50; color: white; padding: 10px 20px;
								text-decoration: none; border-radius: 5px; font-weight: bold;
								display: inline-block; margin: 5px;
							}
							.my-ns-btn:hover { background-color: #45a049; }
						</style>
						
						<a href="javascript:void(0);" onclick="openContainerLoadingPlan()" class="my-ns-btn">
							Container Loading Plan
						</a>
						`;
							field.defaultValue = buttonHtml;
						} else {
							var buttonHtml = `
						<script>
							function openContainerLoadingPlan() {
                                var suiteletUrl = url.resolveScript({
									scriptId: 'customscript_sl_container_loading_opti',
									deploymentId: 'customdeploy1',
									returnExternalUrl: false
								});
								suiteletUrl += '&so_id='+REC_ID;
								suiteletUrl += '&saleschannel='+CURRENT_RECORD.getValue('cseg_sale_channel');
								suiteletUrl += '&distchannel='+CURRENT_RECORD.getValue('cseg_dist_chanl');
								suiteletUrl += '&customer_id='+CURRENT_RECORD.getValue('entity');
								suiteletUrl += '&shiptocountry='+CURRENT_RECORD.getValue('custbody_ship_to_country');
								window.open(\''+suiteletUrl+'\', '_blank');
							}
						</script>
						<style>
							.my-ns-btn {
								background-color: #4CAF50; color: white; padding: 10px 20px;
								text-decoration: none; border-radius: 5px; font-weight: bold;
								display: inline-block; margin: 5px;
							}
							.my-ns-btn:hover { background-color: #45a049; }
						</style>
						
						<a href="javascript:void(0);" onclick="openContainerLoadingPlan()" class="my-ns-btn">
							Container Loading Plan
						</a>
						`;
							field.defaultValue = buttonHtml;
						}
					}
				}
			} catch (e) {
				log.error('beforeLoad', e);
			}

			try {
				// ------------------------------------------------
				// ----- Button Cancel Shipping Advice
				if (type === UserEventType.VIEW && form) {
					// Check Request From UI
					if (execContext === runtime.ContextType.USER_INTERFACE) {
						var filters = [{name: "internalid", join: null, operator: 'is', values: recordId}];
						var ssSOAdvice = libCode.loadSavedSearch('transaction', 'customsearch_ss_cancel_shipping_advice', filters);
						log.debug('SS - Cancel Shipping Advice', {recordId, 'ssSOAdvice': ssSOAdvice.length});

						if (ssSOAdvice.length > 0) {
							var targetURL = url.resolveScript({
								scriptId: 'customscript_sl_cancel_shipping_advice',
								deploymentId: 1,
								params: {so_id: recordId},
							});
							form.addButton({
								id: 'custpage_btn_cancel_shipping_advice',
								label: 'Cancel Shipping Advice',
								functionName: `window.open('${targetURL}', '_self');`,
							});
						}
					}
				}
			} catch (e) {
				log.error('BEFORE LOAD BUTTON CANCEL SHIPPING ADVICE ERROR', e);
			}

			try {
				// ------------------------------------------------
				// ----- Check Shipping Advice Ready to Fulfill
				if (type === UserEventType.VIEW && execContext === runtime.ContextType.USER_INTERFACE) {
					var ssCheckSARdy2Fulfill = libCode.loadSavedSearch('transaction', 'customsearch_ss_sa_4geninvoice_line_ex', [
						{name: "internalid", operator: 'is', values: recordId},
					]);

					if (ssCheckSARdy2Fulfill.length > 0) {
						redirect.toSuitelet({
							scriptId: 'customscript_sl_if_inv_from_sa',
							deploymentId: '1',
							parameters: {
								so_sa: recordId,
								so_performa: ssCheckSARdy2Fulfill[0].getValue('custbody_ex_ref_pi'),
							},
						});
						return;
					}
				}
			} catch (e) {
				log.error('BEFORE LOAD CHECK SHIPPING ADVICE READY TO FULFILL ERROR', e);
			}

			try {
				// ------------------------------------------------
				// ----- Check Shipping Advice Ready to Gen Transfer Order
				if (type === UserEventType.VIEW && execContext === runtime.ContextType.USER_INTERFACE) {
					var ssCheckSARdy2TO = libCode.loadSavedSearch('transaction', 'customsearch_ss_sa_wait2gen_to', [
						{name: "internalid", operator: 'is', values: recordId},
					]);

					log.debug('SS - Check SA Ready to Gen TO', {recordId, 'ssCheckSARdy2TO': ssCheckSARdy2TO.length});

					if (ssCheckSARdy2TO.length > 0) {
						redirect.toSuitelet({
							scriptId: 'customscript_sl_sa_gen_to_and_if',
							deploymentId: '1',
							parameters: {
								so_sa: recordId,
								so_performa: ssCheckSARdy2TO[0].getValue('custbody_ex_ref_pi'),
							},
						});
						return;
					}
				}
			} catch (e) {
				log.error('BEFORE LOAD CHECK SHIPPING ADVICE READY TO GEN TRANSFER ORDER ERROR', e);
			}

			// --- Button Request for Edit PI ---
			try {
				if (type === UserEventType.VIEW && form) {
					// Check Request From UI
					if (execContext === runtime.ContextType.USER_INTERFACE) {
                        var lineid = [];
						var showbtn = false;
						var pi_status = cRecord.getValue('custbody_exp_pi_status');
						var domestic_export = cRecord.getValue('cseg_dom_exp');
						var pi_line_count = cRecord.getLineCount({sublistId: 'item'});
						var request_status = cRecord.getValue('custbody_pi_request_for_edit');
						var sa_check = cRecord.getValue('custbody_is_shippingadvice');
						if (domestic_export == 2) { // Export
                            var filters = [{name: "internalid", join: 'custbody_ex_ref_pi', operator: 'is', values: recordId}];
                            var ssSOAdvice = libCode.loadSavedSearch('transaction', 'customsearch_ss_sa_4sublist_ex_2', filters);
                            log.debug('SS - Request for Edit PI', {recordId, 'ssSOAdvice': ssSOAdvice.length});
							if (!!ssSOAdvice && ssSOAdvice.length > 0) {
								for (var i = 0; i < ssSOAdvice.length; i++) {
									var line_pi = ssSOAdvice[i].getValue({name: 'custcol_pi_line_id', join: null, summary: 'GROUP'});
									if (!!line_pi) {
										if (lineid.indexOf(line_pi) == -1) {
											lineid.push(line_pi);

										}
									}
								}

							}

							for (let i = 0; i < pi_line_count; i++) {
								let item_line = cRecord.getSublistValue({sublistId: 'item', fieldId: 'line', line: i});
								if (lineid.indexOf(item_line.toString()) == -1) {
									showbtn = true;
								}
							}

							if ((pi_status == 1) && showbtn == true && request_status != 1 && sa_check != true) { // (Confirm Order ) , Request foe Edit PI // || pi_status == 2 || Planner Reject
								var targetURL = url.resolveScript({
									scriptId: 'customscript_script_sl_stampreqforeditpi',
									deploymentId: 1,
									params: {so_id: recordId},
								});
								form.addButton({
									id: 'custpage_btn_request_edit_pi',
									label: 'Request for Edit PI',
									functionName: `window.open('${targetURL}', '_self');`,
								});
							}

						}
					}
				}
			} catch (e) {
				log.error('BEFORE LOAD BUTTON REQUEST FOR EDIT PI', e);
			}

			try {
				if (type === UserEventType.VIEW) {
                    let resultsObj = libUtility.getLookupFields(recordType, recordId, ['customform', 'custbody_incoterms.custrecord_incl_fob_in_inv']);
					const {customform = '', customform_text = ''} = resultsObj;
                    let includeFOBInInvoicePrice = resultsObj['custbody_incoterms.custrecord_incl_fob_in_inv'] || false; // Incoterms include FOB in Invoice Price

					let customformTxt = customform_text;
					let rectype = recordType;
					let recid = recordId;
					// Check Request From UI
					if (execContext === runtime.ContextType.USER_INTERFACE) {
						let cseg_dom_exp = cRecord.getText({fieldId: 'cseg_dom_exp'});
						let status = cRecord.getValue({fieldId: 'status'});
						let custbody_ex_ref_pi = cRecord.getValue({fieldId: 'custbody_ex_ref_pi'});
						let custbody_exp_ordertype = cRecord.getValue({fieldId: 'custbody_exp_ordertype'});
						let cseg_sale_channel = cRecord.getValue({fieldId: 'cseg_sale_channel'});
						let shiptocountry = cRecord.getValue({fieldId: 'custbody_ship_to_country'});
						let shippingadvice_status = cRecord.getValue({fieldId: 'custbody_shippingadvice_status'});
                        let custbody_incoterms = cRecord.getValue({ fieldId: 'custbody_incoterms' });
						let is_shippingadvice = cRecord.getValue({fieldId: 'custbody_is_shippingadvice'});
						let fob_net_amount_original = cRecord.getValue({ fieldId: 'custbody_fob_net_amount_original' });
						let shipDate = cRecord.getValue({fieldId: 'shipdate'}) || null;
						if (status === 'Pending Fulfillment') {
							let logId = loadSSSlCombineSalesOrderLog(recordId);
							if (!!logId) {
								let params = {
									recordId,
									recordType,
									custpage_log_id: logId,
								};
								createBTN_CloseCombineDomestic(form, params);
							} else {
								let checkCombine = false;
								for (let i = 0; i < cRecord.getLineCount({sublistId: 'item'}); i++) {
									let custcol_exp_cirefpinum = cRecord.getSublistValue({sublistId: 'item', fieldId: 'custcol_exp_cirefpinum', line: i});
									if (!!custcol_exp_cirefpinum) {
										checkCombine = true;
									}
								}
								if (checkCombine) {
									let params = {
										recordId,
										recordType,
									};
									createBTN_CloseCombine(form, params);
								}
							}

							/**
							 * @changes ไม่ได้ใช้เเล้ว Edit Shipping Advice Export
							 */
							// createBTN_UpdateShippingAdvice(form, {
							// 	custpage_shipping_advice: recordId,
							// 	custpage_rectype: recordType,
							// 	custpage_pi: custbody_ex_ref_pi
							// });

						}

						if (!!shipDate && custbody_exp_ordertype == '6') { // Custom Invoice
							let params = {
								recid: recordId
							};
							createBTN_EnterFobPrice(form, params);
						}

                        /**
                         * shippingadvice_status : 4 = Draft SA
                         * custbody_incoterms : FOB Incoterms 2020
                         *  Include FOB in Invoice Price = true ไม่ต้องคำนวน FOB Price
                         */
                        if (is_shippingadvice == true && shippingadvice_status == '4') {
                            if (!fob_net_amount_original && custbody_incoterms != '9' && includeFOBInInvoicePrice == false) {
                                // Alert แจ้งเตือนให้กรอก FOB Price ก่อน Confirm Shipping Advice
                                createBTN_ConfirmShippingAdviceAlert(form, { recid: recordId });
                            } else {
                                createBTN_ConfirmShippingAdvice(form, { recid: recordId });
                            }
                        }

						let getNotifiMessage = libFlashNotification.getNotification('shipping-advice-confirm');
						if (!!getNotifiMessage) {
							form.addPageInitMessage({
								type: 'INFORMATION',
								title: 'Shipping Advice',
								message: getNotifiMessage,
								// duration: 5000
							});
						}

						if ([UserEventType.VIEW].includes(type)) {
							// @changes Close Sales Order
                            if (!is_shippingadvice) {
                                if (!!libSalesOrder.checkSOfromSS(recordId)) {
                                    libSalesOrder.createBTN(form, cRecord);
                                }
                            }
							// @changes Close Sales Order
							// Move Script From : src\FileCabinet\SuiteScripts\PFTS\PFTS_PickingList\PFTS_PickingList_Button.js
							// if (customform_text == 'F - Sales Order Form (Domestic)') { //147 26082025
							//     var pf_pdf_url = url.resolveScript({
							//         scriptId: "customscript_pfts_pickinglist_print",
							//         deploymentId: 1,
							//         params: { rectype: recordType, recid: recordId }
							//     });
							//     var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
							//     var print_button_voucher = scriptContext.form.addButton({
							//         id: 'custpage_print_salesorder',
							//         label: 'Print PFTS Picking List (Domestic)',
							//         functionName: script
							//     });
							// }
							// Move Script From : PFTS\PFTS_PackingList\PFTS_PackingList_Button.js
							if (cseg_dom_exp == 'Export') {

								//========= Start : EXP Sales Order Type = Proforma Invoice =========
								if (custbody_exp_ordertype == 5) {
									if (cseg_sale_channel == 14 || cseg_sale_channel == 16) { //Export From TH Mill, Direct Shipment

										// Order Confirmation TH
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_orderconfirmation",
											deploymentId: 1,
											params: {
												rectype: recordType,
												recid: recordId,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_salesorder',
											label: 'Print Order Confirmation (TH)',
											functionName: script,
										});

										//Proforma Invoice TH
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_performainvoice",
											deploymentId: 1,
											params: {
												rectype: recordType,
												recid: recordId,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_salesorder',
											label: 'Print Proforma Invoice (TH)',
											functionName: script,
										});
									} else if (cseg_sale_channel == 15) { //Export from UAE

										// Order Confirmation TH
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_orderconfirmation",
											deploymentId: 1,
											params: {
												rectype: recordType,
												recid: recordId,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_salesorder',
											label: 'Print Order Confirmation (TH)',
											functionName: script,
										});

										// Proforma Invoice APC
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_proformainvoiceapc",
											deploymentId: 1,
											params: {
												rectype: recordType,
												recid: recordId,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_salesorder',
											label: 'Print Proforma Invoice (APC)',
											functionName: script,
										});
									} else if (cseg_sale_channel == 26 && shiptocountry == 184) { //DE Warehouse , Germany

										//Order Confirmation EU-ENG
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_orderconfirmationeueng",
											deploymentId: 1,
											params: {
												rectype: recordType,
												recid: recordId,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_salesorder',
											label: 'Print Order Confirmation (EU-ENG)',
											functionName: script,
										});

										//Proforma Invoice EU-DE
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_proformainvoiceeude",
											deploymentId: 1,
											params: {
												rectype: recordType,
												recid: recordId,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_salesorder',
											label: 'Print Proforma Invoice (EU-DE)',
											functionName: script,
										});
									} else if (cseg_sale_channel == 17 && shiptocountry == 177) { //DE Warehouse, France
										//Order Confirmation EU-FR
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_orderconfirmationeufr",
											deploymentId: 1,
											params: {
												rectype: recordType,
												recid: recordId,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_salesorder',
											label: 'Print Order Confirmation (EU-FR)',
											functionName: script,
										});

										//Proforma Invoice EU-FR
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_proformainvoiceeufr",
											deploymentId: 1,
											params: {
												rectype: rectype,
												recid: recid,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_salesorder',
											label: 'Print Proforma Invoice (EU-FR)',
											functionName: script,
										});
									} else {
										//Order Confirmation EU-ENG
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_orderconfirmationeueng",
											deploymentId: 1,
											params: {
												rectype: recordType,
												recid: recordId,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_salesorder',
											label: 'Print Order Confirmation (EU-ENG)',
											functionName: script,
										});

										//Proforma Invoice EU-ENG
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_proformainvoiceeueng",
											deploymentId: 1,
											params: {
												rectype: rectype,
												recid: recid,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_salesorder',
											label: 'Print Proforma Invoice (EU-ENG)',
											functionName: script,
										});
									}

								}
								//========= End : EXP Sales Order Type = Proforma Invoice =========

								//========= Start : EXP Sales Order Type = Custom Invoice =========
								if (custbody_exp_ordertype == 6) {

									if (cseg_sale_channel == 14 || cseg_sale_channel == 16  ) { //Export From TH Mill || direct shipment

										//Custom Invoice TH
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_custominvoice",
											deploymentId: 1,
											params: {
												rectype: rectype,
												recid: recid,
												piid: custbody_ex_ref_pi
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_customsinvoice',
											label: 'Print Customs Invoice (TH)',
											functionName: script,
										});

										//Commercial Invoicee TH
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_aa_draftcommercialinvo",
											deploymentId: 1,
											params: {
												rectype: rectype,
												recid: recid,
											},
										});

										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_CITH = scriptContext.form.addButton({
											id: 'custpage_print_commercialinvoiceth',
											label: 'Print Commercial Invoice (TH)',
											functionName: script,
										});



										// Packing Lists TH
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_packinglist",
											deploymentId: 1,
											params: {
												rectype: recordType,
												recid: recordId,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_salesorder',
											label: 'Print Packing List (Custom)',
											functionName: script,
										});



										var pf_pdf_url = url.resolveScript({
											scriptId: "customscriptpfts_packinglistcustomci",
											deploymentId: 1,
											params: {
												rectype: recordType,
												recid: recordId,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_customci = scriptContext.form.addButton({
											id: 'custpage_print_customci',
											label: 'Print Packing List (CI)',
											functionName: script,
										});
									} else if (cseg_sale_channel == 15) { //Export from UAE

										//Custom Invoice APC
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_aa_custominvoiceapc",
											deploymentId: 1,
											params: {
												rectype: rectype,
												recid: recid,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_customsinvoice',
											label: 'Print Customs Invoice (APC)',
											functionName: script,
										});

										//Packing List APC
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_packinglistapc",
											deploymentId: 1,
											params: {
												rectype: recordType,
												recid: recordId,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_salesorder',
											label: 'Print Packing List (APC)',
											functionName: script,
										});

										//Delivery Order UAE
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_aa_deliverorderuae",
											deploymentId: 1,
											params: {rectype: rectype, recid: recid},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_deliverorderuae',
											label: 'Print Deliver Order (UAE)',
											functionName: script,
										});


										//Delivery Advice UAE
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_aa_deliveradviceuae",
											deploymentId: 1,
											params: {rectype: rectype, recid: recid},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";

										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_deliveradviceuae',
											label: 'Print Deliver Advice (UAE)',
											functionName: script,
										});
									} else {
										//Custom Invoice EU
										var pf_pdf_url = url.resolveScript({
											scriptId: "customscript_pfts_custominvoiceeu",
											deploymentId: 1,
											params: {
												rectype: rectype,
												recid: recid,
											},
										});
										var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
										var print_button_voucher = scriptContext.form.addButton({
											id: 'custpage_print_customsinvoice',
											label: 'Print Customs Invoice (EU)',
											functionName: script,
										});
									}

									// Shipping Advice
									var pf_pdf_url = url.resolveScript({
										scriptId: "customscript_pfts_aa_shippingadvice",
										deploymentId: 1,
										params: {rectype: rectype, recid: recid},
									});
									var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";

									var print_button_voucher = scriptContext.form.addButton({
										id: 'custpage_print_shippingAdvice',
										label: 'Print Shipping Advice',
										functionName: script,
									});

									//Shipping Instruction
									var pf_pdf_url = url.resolveScript({
										scriptId: "customscript_pfts_shippinginstruction",
										deploymentId: 1,
										params: {rectype: rectype, recid: recid},
									});
									var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
									var print_button_voucher = scriptContext.form.addButton({
										id: 'custpage_print_ShippingInstruction',
										// label : 'Print PFTS ' + print_out_obj[thl_doc_print_out_type].eng_name,
										label: 'Print Shipping Instruction',
										functionName: script,
									});

									var pf_pdf_url = url.resolveScript({
										scriptId: "customscript_pfts_verifiedgrossmass",
										deploymentId: 1,
										params: { rectype: rectype, recid: recid }
									});
									var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
									var print_button_Verified = scriptContext.form.addButton({
										id: 'custpage_print_VerifiedGrossMass',
										// label : 'Print PFTS ' + print_out_obj[thl_doc_print_out_type].eng_name,
										label: 'Print Verified Gross Mass',
										functionName: script
									});


									var pf_pdf_url = url.resolveScript({
										scriptId: "customscript_pfts_containerlist",
										deploymentId: 1,
										params: { rectype: rectype, recid: recid }
									});
									var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
									var print_button_container = scriptContext.form.addButton({
										id: 'custpage_print_container_list',
										// label : 'Print PFTS ' + print_out_obj[thl_doc_print_out_type].eng_name,
										label: 'Print Container List',
										functionName: script
									});

									var pf_pdf_url = url.resolveScript({
										scriptId: "customscript_pfts_rolllist_print",
										deploymentId: 1,
										params: { rectype: rectype, recid: recid }
									});
									var script = " a = ''; var url = '" + pf_pdf_url + "'; window.open(url);";
									var print_button_Roll = scriptContext.form.addButton({
										id: 'custpage_print_Roll_list',
										// label : 'Print PFTS ' + print_out_obj[thl_doc_print_out_type].eng_name,
										label: 'Print Roll List',
										functionName: script
									});

								}



								//========= End : EXP Sales Order Type = Custom Invoice =========
							}
						}
					}
					// @changes Select Item Popup
					// Check Request From UI
					if ([UserEventType.CREATE, UserEventType.COPY, UserEventType.EDIT].includes(type)) {
						let sublistItemObj = form.getSublist({id: 'item'});
						if (!!sublistItemObj) {
							sublistItemObj.addButton({
								id: 'custpage_btn_select_Item',
								label: 'Select Item Popup',
								functionName: "handleOpenPopup_SelectItem",
							});
							// log.debug({
							//     title: 'sublistItemObj',
							//     details: {
							//         sublistItemObj: sublistItemObj,
							//     }
							// });
						}
					}
					// @changes Select Item Popup
				}

				if ([UserEventType.CREATE, UserEventType.COPY, UserEventType.EDIT].includes(type)) {

					let cseg_dom_exp = cRecord.getValue({fieldId: 'cseg_dom_exp'});
					// log.debug('BEFORE LOAD - Add Field Sales Rep', {cseg_dom_exp, customform: cRecord.getValue('customform')});
					if(cseg_dom_exp == 1 || cRecord.getValue('customform') == 147) {//Domestic
						// Add Field Sales Rep
						libFieldSalesRep.addFieldSalesRep(scriptContext);
					}
				}
			} catch (e) {
				log.debug({
					title: 'BEFORE LOAD ERROR',
					details: e,
				});
			}
            
            if ([UserEventType.CREATE, UserEventType.COPY, UserEventType.EDIT].includes(type)) {
                let sublistConcalObj = form.getSublist({ id: 'recmachcustrecord_concal_ref_so' });
                if (!!sublistConcalObj) {
                    sublistConcalObj.addButton({
                        id: 'custpage_btn_copy_container_line',
                        functionName: 'handleBtnCopyContainerLine()',
                        label: 'Copy Line'
                    });
                }
            }


            /**
             * 
            if (recordId == '1195062' && type === UserEventType.EDIT && userId == 189) {
                try {
                    checkLTL(cRecord);
                } catch (error) {
                    log.error({ title: 'Error Before Load', details: error });
                }

            }
             */

		}

		function _UE_Sales_Order_BeforeSubmit(scriptContext) {
			// const { newRecord : cRecord } = scriptContext;
			// const userId = runtime.getCurrentUser().id;
			// let type = scriptContext.type;
			// let recordId = cRecord.id;
			// let recordType = cRecord.type;
			// ============================================
		}

		function _UE_Sales_Order_AfterSubmit(scriptContext) {
			const {newRecord: cRecord, oldRecord, UserEventType} = scriptContext;
			const userId = runtime.getCurrentUser().id;
			let type = scriptContext.type;
			let recordId = cRecord.id;
			let recordType = cRecord.type;
			let { executionContext } = runtime;

			let timer = new Date();
			// ============================================
			if (type === UserEventType.DELETE) return;

			// @changes 2
			let entity = cRecord.getValue({fieldId: 'entity'});
            let cseg_dom_exp = cRecord.getValue({ fieldId: 'cseg_dom_exp' });
            if (cseg_dom_exp == '2') { // Export
                let resultCustomerObj = libUtility.getLookupFields('customer', entity, ['custentity_no_apply_ltl_surcharge']);
                //No.apply LTL Surcharge === true
                if (resultCustomerObj?.custentity_no_apply_ltl_surcharge !== true) {
                    let recRecord = record.load({type: recordType, id: recordId, isDynamic: true});
                    // Country Zone
                    let trandate = cRecord.getValue({fieldId: 'trandate'});
                    let shipAddressList = cRecord.getValue({fieldId: 'shipaddresslist'});
                    let shippingaddress = recRecord.getValue({fieldId: 'shippingaddress'});
                    let resultAddressObj = libUtility.getLookupFields('address', shippingaddress, ['zip', 'country']);
                    let postCode = resultAddressObj?.zip || '';
                    // Currency
                    let currency = cRecord.getValue({fieldId: 'currency'}) || '1';
                    // Country
                    let country = resultAddressObj?.country || '';
                    // Date From
                    let dateFrom = libUtility.DateFormat(trandate);
                    // Date To
                    let sales_channel = recRecord.getValue({fieldId: 'cseg_sale_channel'});
                    let distributon = recRecord.getValue({fieldId: 'cseg_dist_chanl'});
                    let location = recRecord.getValue({fieldId: 'location'});
                    let itemQTYPalletObj = {};
                    if (sales_channel && distributon && location) {
                        for (let i = 0; i < cRecord.getLineCount({sublistId: 'item'}); i++) {
                            let custcolQtyPallet = cRecord.getSublistValue({sublistId: 'item', fieldId: 'custcol_qty_pallet', line: i});
                            let convOfUnitPallet = cRecord.getSublistValue({sublistId: 'item', fieldId: 'custcol_conv_of_unit_pal', line: i});
                            let item = cRecord.getSublistValue({sublistId: 'item', fieldId: 'item', line: i});
                            let custcolLtlItem = cRecord.getSublistValue({sublistId: 'item', fieldId: 'custcol_ltl_item', line: i});
                            if (custcolLtlItem === true) {
                                continue;
                            }
                            if (convOfUnitPallet) {
                                if (itemQTYPalletObj[item] === undefined) {
                                    itemQTYPalletObj[item] = {
                                        item,
                                        qty_pallet: 0,
                                        qty_conv_pallet: 0,
                                        post_code: postCode,
                                        pallet_size: '',
                                        pallet_layer: '',
                                        surcharge_rate: 0,
                                        currency: currency,
                                        country: country,
                                        sales_channel,
                                        distributon,
                                        location,
                                    };
                                }
                                itemQTYPalletObj[item].qty_pallet = libCode.addNumber(itemQTYPalletObj[item]?.qty_pallet || 0, custcolQtyPallet);
                                itemQTYPalletObj[item].qty_conv_pallet = libCode.addNumber(itemQTYPalletObj[item]?.qty_conv_pallet || 0, convOfUnitPallet);
                                /*
                                itemListArr.push(item);
                                itemQTYPalletArr.push({
                                    item,
                                    qty_pallet: custcolQtyPallet,
                                    post_code: postCode,
                                    pallet_size: '',
                                    pallet_layer: '',
                                    surcharge_rate: 0,
                                    currency: currency,
                                    country: country,
                                    sales_channel,
                                    distributon,
                                    location
                                });
                                */
                            }
                        }
                        let itemQTYPalletArr = Object.values(itemQTYPalletObj);
                        let itemListArr = Object.keys(itemQTYPalletObj);
                        try {
                            if (itemQTYPalletArr.length > 0 && itemListArr.length > 0) {
                                let resultsItemLTLSurcharge = checkConfigLTLSurcharg({trandate: dateFrom, itemQTYPalletArr, itemListArr, currency, sales_channel, distributon, location});
                                let flagSave = false;
                                if (resultsItemLTLSurcharge.length > 0) {
                                    let recRecord = record.load({type: recordType, id: recordId, isDynamic: true});
                                    for (let r = recRecord.getLineCount({sublistId: 'item'}) - 1; r >= 0; r--) {
                                        let custcolLtlItem = cRecord.getSublistValue({sublistId: 'item', fieldId: 'custcol_ltl_item', line: r});
                                        // ลบแถวที่เป็น Item Surcharge ออก
                                        if (custcolLtlItem === true) {
                                            recRecord.removeLine({sublistId: 'item', line: r});
                                        }
                                    }
                                    resultsItemLTLSurcharge.forEach(function (row, index) {
                                        const {item_surcharge = '', rate_surcharge = 0} = row;
                                        if (!!item_surcharge && !!rate_surcharge) {
                                            flagSave = true;
                                            recRecord.selectNewLine({sublistId: 'item'});
                                            recRecord.setCurrentSublistValue({sublistId: 'item', fieldId: 'item', value: item_surcharge, forceSyncSourcing: true});
                                            recRecord.setCurrentSublistValue({sublistId: 'item', fieldId: 'amount', value: rate_surcharge, forceSyncSourcing: true});
                                            recRecord.setCurrentSublistValue({sublistId: 'item', fieldId: 'custcol_ltl_item', value: true, forceSyncSourcing: true});
                                            recRecord.commitLine({sublistId: 'item'});
                                        }
                                    });
                                    if (flagSave) {
                                        recRecord.save();
                                    }
                                }
                            }
                            log.debug('_UE_Sales_Order_AfterSubmit | shipAddressList', {recordId, shipAddressList, resultAddressObj, shippingaddress, itemQTYPalletArr});
                        } catch (error) {
                            log.error({
                                title: '_UE_Sales_Order_AfterSubmit | LTL_SURCHARGE ',
                                details: error,
                            });
                        }
                    }
                }
            }
            // @changes 2

			// @changes 1
			let customForm = cRecord.getValue({fieldId: 'customform'});
			// log.debug({
			//     title: '_UE_Sales_Order_AfterSubmit | customForm',
			//     details: { customForm, type }
			// });
			if (customForm === FORM_SALES_ORDER_EXPORT) {

				if (type === UserEventType.EDIT) {
					try {
						let newTotal = cRecord.getValue({fieldId: 'total'});
						let newShipaddresslist = cRecord.getValue({fieldId: 'shipaddresslist'});
						let newBilladdresslist = cRecord.getValue({fieldId: 'billaddresslist'});
						let oldTotal = oldRecord.getValue({fieldId: 'total'});
                        /**
                         * เนื่องจากบางครั้งอาจมีการเช็ต shipaddresslist หรือ billaddresslist เป็น Custom ==> '-2'
                         * ทำให้ oldRecord ดึงค่ามาได้เป็นว่าง '' หรือ null
                         */
						let oldShipaddresslist = oldRecord.getValue({fieldId: 'shipaddresslist'}) || '-2';
						let oldBilladdresslist = oldRecord.getValue({fieldId: 'billaddresslist'}) || '-2';
						let isChange = false;

                        log.debug({
                            title: recordId + ' | _UE_Sales_Order_AfterSubmit | Revision',
                            details: {
                                customForm,
                                newTotal,
                                oldTotal,
                                newShipaddresslist,
                                oldShipaddresslist,
                                newBilladdresslist,
                                oldBilladdresslist,
                            }
                        });

						let recRecord = record.load({type: recordType, id: recordId});
						if ((newTotal !== oldTotal) || (newShipaddresslist !== oldShipaddresslist) || (newBilladdresslist !== oldBilladdresslist)) {
							let revisionNo = Number(cRecord.getValue({fieldId: 'custbody_revision_no'})) || 0;
							let revisionNoCount = (revisionNo + 1);
							// custbody_revision_no
							// custbody_pi_revision_no
							const tranid = recRecord.getValue({fieldId: 'tranid'});
							let piRevisionNo = tranid + "-" + revisionNoCount;
							recRecord.setValue({fieldId: 'custbody_revision_no', value: revisionNoCount});
							recRecord.setValue({fieldId: 'custbody_pi_revision_no', value: piRevisionNo});
							isChange = true;
						}
						// @changes 3 // check line id and copy to custom column
						for (let i = 0; i < recRecord.getLineCount({sublistId: 'item'}); i++) {
							let lineId = recRecord.getSublistValue({sublistId: 'item', fieldId: 'line', line: i});
							let sfLineId = recRecord.getSublistValue({sublistId: 'item', fieldId: 'custcol_sf_line_id', line: i});
							if (lineId !== sfLineId) {
								isChange = true;
								break;
							}
						}
						if (isChange) {
							// @changes 3
							for (let i = 0; i < recRecord.getLineCount({sublistId: 'item'}); i++) {
								let lineId = recRecord.getSublistValue({sublistId: 'item', fieldId: 'line', line: i});
								log.debug({title: '_UE_Sales_Order_AfterSubmit | lineId', details: lineId});
								recRecord.setSublistValue({
									sublistId: 'item',
									fieldId: 'custcol_sf_line_id',
									value: lineId,
									line: i,
								});
							}
							recRecord.save({ignoreMandatoryFields: true});
						}
					} catch (error) {
						log.error({
							title: '_UE_Sales_Order_AfterSubmit',
							details: error,
						});
					}
				}
			}

			// @changes 1
			if (type === UserEventType.CREATE || type === UserEventType.EDIT || type === UserEventType.COPY) {
				// start - Calculate Convert Unit
				let recRecord_so = record.load({type: recordType, id: recordId, isDynamic: true});
				let cseg_dom_exp = recRecord_so.getValue({fieldId: 'cseg_dom_exp'});
                let is_shippingadvice = recRecord_so.getValue({ fieldId: 'custbody_is_shippingadvice' });
				//
				// let ss_so_filter = [];
				// let sub_group = [];
				var update_line = false;
			
				if (cseg_dom_exp == '2') { // 2	Export
					let resultsMappingFields = loadSSUpdateBookingContainer();
					log.debug({title: 'resultsMappingFields', details: resultsMappingFields});

					for (const sublist_id in resultsMappingFields) {
						if (!Object.hasOwn(resultsMappingFields, sublist_id)) continue;
						let line_count = recRecord_so.getLineCount({sublistId: sublist_id});
						if (line_count > 0) {
							const mappingFieldsArr = resultsMappingFields[sublist_id];
							for (let r = 0; r < line_count; r++) {
								recRecord_so.selectLine({sublistId: sublist_id, line: r});
								for (const mappingField of mappingFieldsArr) {
									let {update_from_field_id, update_to_field_id} = mappingField;
									// Copy Body field to sublist line
									let value = recRecord_so.getValue({fieldId: update_from_field_id});
									if (value) {
										update_line = true;
										recRecord_so.setCurrentSublistValue({sublistId: sublist_id, fieldId: update_to_field_id, value: value});
									}
								}
								recRecord_so.commitLine({sublistId: sublist_id});
							}
						}
					}
				}

                if ([UserEventType.CREATE, UserEventType.COPY].includes(type)) {
                    try {
                        const tranid = recRecord_so.getValue({ fieldId: 'tranid' });
                        recRecord_so.setValue({ fieldId: 'custbody_revision_no', value: 0 });
                        recRecord_so.setValue({ fieldId: 'custbody_pi_revision_no', value: tranid });
                        // @changes 3
                        for (let i = 0; i < recRecord_so.getLineCount({ sublistId: 'item' }); i++) {
                            let lineId = recRecord_so.getSublistValue({ sublistId: 'item', fieldId: 'line', line: i });
                            recRecord_so.setSublistValue({
                                sublistId: 'item',
                                fieldId: 'custcol_sf_line_id',
                                value: lineId,
                                line: i,
                            });
                        }
                    } catch (error) {
                        log.error({
                            title: '_UE_Sales_Order_AfterSubmit',
                            details: error,
                        });
                    }
                }
                if (is_shippingadvice == true) {
                    var payment_terms_id = cRecord.getValue('custbody_payment_terms');
                    var tran_date = cRecord.getValue('custbody_sa_draft_bl_date');
                    var custBlDate = cRecord.getValue('custbody_sa_draft_bl_date');
                    let entity_id = cRecord.getValue('entity');
                    // console.log({ payment_terms_id, tran_date });
                    const DOMESTIC_EXPORT = LibConstants.DOMESTIC_EXPORT;
                    if (!!payment_terms_id && !!tran_date) {
                        let due_date = null;
                        // let day_due = 0;
                        // var entity_id = cRecord.getValue('entity');
                        // @requires 1 start
                        let customerTermsData = loadSSCustomerPaymentTerms(entity_id);
                        const { 
                            customer_internal_id, 
                            domestic_export, 
                            internal_payment_terms_days = 0, // Internal Payment Terms (Days)
                            name, 
                            payment_terms_list: PAYMENT_TERMS_DATA = {} 
                        } = customerTermsData[entity_id] || {};

                        if (PAYMENT_TERMS_DATA[payment_terms_id] !== undefined && !!domestic_export) {
                            let paymentTermNetDue = PAYMENT_TERMS_DATA[payment_terms_id]?.days_till_net_due || 0;
                            let endOfMonth = PAYMENT_TERMS_DATA[payment_terms_id]?.end_of_month;
                            let blDate = PAYMENT_TERMS_DATA[payment_terms_id]?.bl_date;
                            if (domestic_export === DOMESTIC_EXPORT.DOMESTIC) {
                                // @requires 1.3
                                due_date = due_date = libUtility.addDaysToDate(tran_date, paymentTermNetDue);
                                // log.debug('1.3', { due_date });
                                log.debug({
                                    title: 'Domestic Due Date Calculation',
                                    details: {
                                        tran_date,
                                        paymentTermNetDue,
                                        due_date
                                    }
                                });
                            }
                            else if (domestic_export === DOMESTIC_EXPORT.EXPORT) {
                                if (endOfMonth === true) {
                                    // @requires 1.1
                                    // หาวันที่สิ้นเดือนของ trandate
                                    let lastDayOfMonth = libUtility.getLastDayOfMonth(tran_date);
                                    due_date = libUtility.addDaysToDate(lastDayOfMonth, paymentTermNetDue);
                                    log.debug({
                                        title: 'Export Due Date Calculation - End of Month',
                                        details: {
                                            tran_date,
                                            lastDayOfMonth,
                                            paymentTermNetDue,
                                            due_date
                                        }
                                    });
                                }
                                else if (blDate === true) {
                                    // @requires 1.2
                                    if (!!custBlDate) {
                                        due_date = libUtility.addDaysToDate(custBlDate, paymentTermNetDue);
                                    }
                                    log.debug({
                                        title: 'Export Due Date Calculation - BL Date',
                                        details: { custBlDate, due_date }
                                    });
                                }
                                else {
                                    // @requires 1.3
                                    due_date = due_date = libUtility.addDaysToDate(tran_date, paymentTermNetDue);
                                    log.debug({
                                        title: 'Export Due Date Calculation - Standard',
                                        details: {
                                            tran_date,
                                            paymentTermNetDue,
                                            due_date
                                        }
                                    });
                                }
                            }
                        }
                        // var valuesToSet = {};
                        if (due_date) {
                            let internalPaymentTermsDate = libUtility.addDaysToDate(due_date, internal_payment_terms_days);
                            update_line = true;
                            recRecord_so.setValue({ fieldId: 'custbody_draft_due_date', value: due_date, ignoreFieldChange: true, forceSyncSourcing: true });

                            // valuesToSet['duedate'] = due_date;
                            log.debug({
                                title: 'Set Due Date',
                                details: { tran_date, internal_payment_terms_days, internalPaymentTermsDate }
                            });
                            // // 1.4 : Internal Terms
                            // // cRecord.setValue({ fieldId: 'custbody_due_date_c', value: internalPaymentTermsDate, ignoreFieldChange: true, forceSyncSourcing: true });
                            // valuesToSet['custbody_due_date_c'] = internalPaymentTermsDate;
                        }
                        // else {
                        //     // let internalPaymentTermsDate = libUtility.addDaysToDate(tran_date, internal_payment_terms_days);
                        //     // // Internal Terms
                        //     // cRecord.setValue({ fieldId: 'custbody_due_date_c', value: internalPaymentTermsDate, ignoreFieldChange: true, forceSyncSourcing: true });
                        //     // console.log('(tran_date + internal_payment_terms_days)', { tran_date, internal_payment_terms_days, internalPaymentTermsDate });
                        //     // cRecord.setValue({ fieldId: 'duedate', value: tran_date, ignoreFieldChange: true, forceSyncSourcing: true });
                        //     valuesToSet['duedate'] = tran_date;
                        // }
                        // log.debug({ title: 'valuesToSet', details: valuesToSet });
                        // if (Object.keys(valuesToSet).length > 0) {
                        //     record.submitFields({
                        //         type: cRecord.type,
                        //         id: cRecord.id,
                        //         values: valuesToSet,
                        //         options: { enableSourcing: false, ignoreMandatoryFields: true },
                        //     });
                        // }
                    }
                }
				if (update_line == true) {
					log.debug({title: 'Update_SO', details: update_line});
					recRecord_so.save({ignoreMandatoryFields: true});
				}
			}

			if (type == 'edit' || type == 'xedit') {
				log.debug('_UE_Sales_Order_BeforeSubmit [' + recordId + ']', 'type = ' + type);

				var soLookup = search.lookupFields({type: 'transaction', id: recordId, columns: ['custbody_exp_pi_status', 'custbody_pi_request_for_edit']});
				var piStatus = soLookup.custbody_exp_pi_status?.[0]?.value; // 4 = Pending Planner Confirm
				var piRequestForEdit = soLookup.custbody_pi_request_for_edit?.[0]?.value; // 2 = Allow for editing

				if (piStatus == 4 && piRequestForEdit == 2) {
					var soObj = record.load({type: recordType, id: recordId, isDynamic: true});
					let lineCount = soObj.getLineCount('item');
					let hasEmptyQtyConfirm = false;
					for (let i = 0; i < lineCount; i++) {
						let qtyConfirm = soObj.getSublistValue({sublistId: 'item', fieldId: 'custcol_check_oh_edit_pi', line: i});
						var qty_ck = soObj.getSublistValue({sublistId: 'item', fieldId: 'quantity', line: i});
						var qty_type = soObj.getSublistValue({sublistId: 'item', fieldId: 'itemtype', line: i});
						if(!!qty_ck && qty_type != 'Service'){
							if (qtyConfirm == true) {
								// log.debug('_UE_Sales_Order_BeforeSubmit', 'lineId = '+lineId+' has empty qtyConfirm');
								hasEmptyQtyConfirm = true;
								break;
							}
						}
					}

					if (!hasEmptyQtyConfirm) {
						var filters = [{name: "internalid", join: 'custbody_ex_ref_pi', operator: 'is', values: recordId}];
						var ssSOAdvice = libCode.loadSavedSearch('transaction', 'customsearch_ss_sa_4sublist_ex_2', filters);
						var mapSAtoPILine = {};
						for (var i = 0; i < ssSOAdvice.length; i++) {
							var line_pi = ssSOAdvice[i].getValue({name: 'custcol_pi_line_id', join: null, summary: 'GROUP'});
							mapSAtoPILine[line_pi] = true;
						}
						log.debug('AftSubmit [' + recordId + ']', 'ssSOAdvice length = ' + ssSOAdvice.length + ' - ' + JSON.stringify(mapSAtoPILine));

						var clearLine = [];
						for (let i = 0; i < lineCount; i++) {
							let qtyConfirm = soObj.getSublistValue({sublistId: 'item', fieldId: 'custcol_exp_qty_confirm_reject', line: i});
							let lineId = soObj.getSublistValue({sublistId: 'item', fieldId: 'line', line: i});
							//let qtyConfirmReject = soObj.getSublistValue({sublistId: 'item', fieldId: 'custcol_exp_qty_confirm_reject', line: i});

							if (!!lineId && !mapSAtoPILine[lineId]) {
								if (qtyConfirm !== null && qtyConfirm !== '' && qtyConfirm !== undefined) {
									soObj.selectLine({sublistId: 'item', line: i});
									soObj.setCurrentSublistValue({sublistId: 'item', fieldId: 'custcol_exp_qty_confirm_reject', value: ''});//Clear value
									soObj.setCurrentSublistValue({sublistId: 'item', fieldId: 'custcol_check_oh_edit_pi', value: true});
									soObj.commitLine({sublistId: 'item'});
									clearLine.push(lineId);
								}
							}
						}

						if (clearLine.length > 0) {
							log.debug('AftSubmit [' + recordId + ']', 'Clear qty_confirm on lines: ' + JSON.stringify(clearLine));
							soObj.save({ignoreMandatoryFields: true});
						}
					}
				}
			}

			log.debug({
				title: recordId + ' | CHECK_TIME | ' + type,
				details: {
					timer: libCode.stopWatch(timer),
					executionContext,
					user: {
						...runtime.getCurrentUser()
					}
				}
			});
		}

		/**
		 * Update Booking Container
		 * - Group by sublist id
		 *
		 * SEARCH ID : customsearch_ss_update_booking_container
		 *
        @example
        let resultsMappingFields = loadSSUpdateBookingContainer();

		 */

		function loadSSUpdateBookingContainer() {

			let ssFilters = [];
			let resultsMappingFields = {};
			const SS_UPDATE_BOOKING_CONTAINER = 'customsearch_ss_update_booking_container';
			let ssResults = libCode.loadSavedSearch(null, SS_UPDATE_BOOKING_CONTAINER, ssFilters, []);
			//console.log({ ssResults: ssResults.length });
			log.debug(SS_UPDATE_BOOKING_CONTAINER, {ss_length: ssResults.length, ssFilters: ssFilters});

			ssResults.forEach(function (row) {
				let transaction_record = row.getValue({"name": "custrecord_ubc_transaction", "label": "Transaction Record"});
				let transaction_record_id = row.getValue({"name": "custrecord_ubc_record_id", "label": "Transaction Record ID"});
				let update_from_field_id = row.getValue({"name": "custrecord_ubc_from_field_id", "label": "Update From Field ID"});
				let update_from_field_name = row.getValue({"name": "custrecord_ubc_from_field_name", "label": "Update From Field Name"});
				let record_type = row.getValue({"name": "custrecord_ubc_record_type", "label": "Record Type"});
				let record_type_id = row.getValue({"name": "custrecord_ubc_record_type_id", "label": "Record Type ID"});
				let sublist_id = row.getValue({"name": "custrecord_ubc_parent_id", "label": "Record Type Parent ID"});
				let update_to_field_id = row.getValue({"name": "custrecord_ubc_update_to_field_id", "label": "Update To Field ID"});
				let update_to_field_name = row.getValue({"name": "custrecord_ubc_to_field_name", "label": "Update to Field Name"});

				if (sublist_id && update_from_field_id && update_to_field_id) {

					if (resultsMappingFields[sublist_id] == undefined) {
						resultsMappingFields[sublist_id] = [];
					}

					resultsMappingFields[sublist_id].push({
						transaction_record,
						transaction_record_id,
						update_from_field_id,
						update_from_field_name,
						record_type,
						record_type_id,
						sublist_id,
						update_to_field_id,
						update_to_field_name,

					});
				}
			});

			return resultsMappingFields;
		}

		function loadSSSlCombineSalesOrderLog(salesOrderId) {
			let ssFilters = [];
			// Sales Order
			ssFilters.push({"name": "custrecord_com_so_sales_order_new", "join": null, "operator": "is", "values": salesOrderId});
			// Status Process
			ssFilters.push({"name": "custrecord_com_so_status_process", "join": null, "operator": "is", "values": "4"}); // Complete
			const SS_SL_COMBINE_SALES_ORDER_LOG = 'customrecord_combine_salesorder_log';
			var ssResults = libCode.loadSavedSearch('customrecord_combine_salesorder_log', null, ssFilters, []);
			//console.log({ ssResults: ssResults.length });
			log.debug(SS_SL_COMBINE_SALES_ORDER_LOG, {ss_length: ssResults.length, ssFilters: ssFilters});
			// ssResults.forEach(function (list) {
			//     console.log(list.getAllValues());
			// });
			if (ssResults.length > 0) {
				return ssResults[0].id;
			}
			return null;
			// return ssResults;
		}

		/**
		 *
		 * @param param0
		 * @returns
		 */
		function checkConfigLTLSurcharg({trandate, itemQTYPalletArr, itemListArr, currency, sales_channel, distributon, location}) {
			let ItemLtlSurchargeArr = loadSSItemLtlSurcharge(itemListArr);
			let resultsItemLTLSurcharge = {};
			// log.debug('checkConfigLTLSurcharg 1', { ItemLtlSurchargeArr, itemQTYPalletArr });
			if (ItemLtlSurchargeArr.length > 0) {
				// itemQTYPalletArr.forEach(function (listObj: ITEM_QTY_PALLET_ARR) {
				for (let i = 0; i < itemQTYPalletArr.length; i++) {
					const { item } = itemQTYPalletArr[i];
					let resultItem = ItemLtlSurchargeArr.find((element) => element.internalid === item);
					// log.debug('ItemLtlSurchargeArr i => ', { i, resultItem });
					if (resultItem) {
						itemQTYPalletArr[i].pallet_size = resultItem.custitem_item_pallet_size || '';
						itemQTYPalletArr[i].pallet_layer = resultItem.custitem_infor_layer || '';
					}
				}
				let palletSizeArr = itemQTYPalletArr.filter(itme => !!itme.pallet_size).map(itme => itme.pallet_size);
				let palletLayerArr = itemQTYPalletArr.filter(itme => !!itme.pallet_layer).map(itme => itme.pallet_layer);

				// group by pallet_size, pallet_layer and sum qty_conv_pallet
				let groupedByPalletSizeLayer = itemQTYPalletArr.reduce(function (acc, item) {
					let key = item.pallet_size + '_' + item.pallet_layer;
					if (!acc[key]) {
						acc[key] = {
							...item,
							qty_conv_pallet: 0,
							items: []
						};
					}
					acc[key].items.push(item.item);
					acc[key].qty_conv_pallet = libCode.addNumber(acc[key].qty_conv_pallet, item.qty_conv_pallet);
					return acc;
				}, {});

				// Convert object to array with same structure as itemQTYPalletArr
				let itemGroupedSizeLayer = Object.values(groupedByPalletSizeLayer).map(function (group) {
					let result = { ...group };
					delete result.items;
					return result;
				});

				log.debug('groupedByPalletSizeLayer', { groupedByPalletSizeLayer, itemGroupedSizeLayer });

				/**
				 *
				 * ถ้า palletSizeArr เเละ  palletLayerArr = 0
				 * เเสดงว่า item master ไม่มี pallet_size, pallet_layer
				 * ไม่ต้องเช็คต่อเเล้ว
				 *
				 */
				if (palletSizeArr.length === 0) {
					log.debug('Item not found Pallet Size', palletSizeArr.length);
					return [];
				}
				if (palletLayerArr.length === 0) {
					log.debug('Item not found Pallet Layer', palletLayerArr.length);
					return [];
				}
				log.debug('Check Config Ltl Surcharg 2', [...itemGroupedSizeLayer]);
				let resultsLtlSurchargArr = loadSSLtlSurcharg({trandate, palletSizeArr, palletLayerArr, currency, sales_channel, distributon, location});
				// log.debug('resultsLtlSurchargArr', resultsLtlSurchargArr.length);
				if (resultsLtlSurchargArr.length > 0) {
					for (let i = 0; i < itemGroupedSizeLayer.length; i++) {
						const {item, qty_pallet, qty_conv_pallet, post_code, pallet_size, pallet_layer, surcharge_rate, currency, country} = itemGroupedSizeLayer[i];
                        /**
                         * เช็คเงื่อนไข LTL Surcharge
                         */
                        let filterValueArr = resultsLtlSurchargArr.filter(function (row, index) {
                            let internalid = row.id;
                            let custrecord_ltl_sur_pallet_size = row.getValue({ "name": "custrecord_ltl_sur_pallet_size", "label": "Pallet Size" }) || '@none@';
                            let custrecord_ltl_sur_currency = row.getValue({ "name": "custrecord_ltl_sur_currency", "label": "Currency" }) || '@none@';
                            let custrecord_ltl_sur_country = row.getText({ "name": "custrecord_ltl_sur_country", "label": "Country" });
                            let custrecord_ltl_sur_pallet_layer = row.getValue({ "name": "custrecord_ltl_sur_pallet_layer", "label": "Pallet Layer" }) || '@none@';
                            let custrecord_ltl_sur_qty_pallet_to = Number(row.getValue({ "name": "custrecord_ltl_sur_qty_pallet_to", "label": "Quantity Pallet To" })) || 0;
                            let custrecord_ltl_sur_qty_pallet = Number(row.getValue({ "name": "custrecord_ltl_sur_qty_pallet", "label": "Quantity Pallet" })) || 0;
                            let custrecord_ltl_zone_postcode = row.getText({ "name": "custrecord_ltl_zone_postcode", "join": "CUSTRECORD_LTL_SUR_COUNTRY_ZONE", "label": "Postcode" }) || '';
                            let zonePostcodeArr = String(custrecord_ltl_zone_postcode).split(',');

                            // post_code เอามาแค่ 2 ตัวหน้า
                            var postCode2Digit = post_code;
                            if (!!post_code && String(post_code).length > 2) {
                                postCode2Digit = String(post_code).substring(0, 2);
                            }

                            let flagCheck = ((pallet_size === custrecord_ltl_sur_pallet_size) &&
                                (zonePostcodeArr.includes(postCode2Digit)) &&
                                (currency === custrecord_ltl_sur_currency) &&
                                (country === custrecord_ltl_sur_country) &&
                                (pallet_layer == custrecord_ltl_sur_pallet_layer) &&
                                ((custrecord_ltl_sur_qty_pallet <= qty_conv_pallet) && (custrecord_ltl_sur_qty_pallet_to >= qty_conv_pallet)))

                            if (flagCheck) {
                                // let checkData = {
                                //     'Setup ID': internalid,
                                //     'Pallet Size': pallet_size + ' _ ' + custrecord_ltl_sur_pallet_size,
                                //     'Post Code': zonePostcodeArr.includes(post_code),
                                //     'Post Code 2 Digit': zonePostcodeArr.includes(postCode2Digit),
                                //     'Currency': currency + ' _ ' + custrecord_ltl_sur_currency,
                                //     'Country': country + ' _ ' + custrecord_ltl_sur_country,
                                //     'Pallet Layer': pallet_layer + ' _ ' + custrecord_ltl_sur_pallet_layer,
                                //     'Qty Pallet': (custrecord_ltl_sur_qty_pallet <= qty_pallet) && (custrecord_ltl_sur_qty_pallet_to >= qty_pallet),
                                //     'Qty Conv Pallet': (custrecord_ltl_sur_qty_pallet <= qty_conv_pallet) && (custrecord_ltl_sur_qty_pallet_to >= qty_conv_pallet)
                                // };

                                return true;
                            }
                            // if ((pallet_size === custrecord_ltl_sur_pallet_size) &&
                            // 	(zonePostcodeArr.includes(postCode2Digit)) &&
                            // 	(currency === custrecord_ltl_sur_currency) &&
                            // 	(country === custrecord_ltl_sur_country) &&
                            // 	(pallet_layer == custrecord_ltl_sur_pallet_layer) &&
                            // 	((custrecord_ltl_sur_qty_pallet <= qty_conv_pallet) && (custrecord_ltl_sur_qty_pallet_to >= qty_conv_pallet))) {
                            // 	return true;
                            // }
                        });

						if (filterValueArr.length > 0) {
							// Item Surcharge เดียวกันให้รวม Surcharge Rate เป็นอันเดียว
							filterValueArr.forEach(function (row, index) {
								let custrecord_ltl_sur_rate = row.getValue({"name": "custrecord_ltl_sur_rate", "label": "Surcharge Rate"});
								let custrecord_ltl_sur_item_surcharge = row.getValue({"name": "custrecord_ltl_sur_item_surcharge", "label": "Item Surcharge"});
								if (!!custrecord_ltl_sur_rate && !!custrecord_ltl_sur_item_surcharge) {
									if (resultsItemLTLSurcharge[custrecord_ltl_sur_item_surcharge] === undefined) {
										resultsItemLTLSurcharge[custrecord_ltl_sur_item_surcharge] = {
											item_surcharge: custrecord_ltl_sur_item_surcharge,
											rate_surcharge: 0,
										};
									}
									resultsItemLTLSurcharge[custrecord_ltl_sur_item_surcharge].rate_surcharge = libCode.addNumber(resultsItemLTLSurcharge[custrecord_ltl_sur_item_surcharge]?.rate_surcharge || 0, custrecord_ltl_sur_rate);
									// itemQTYPalletArr[i].surcharge_rate = custrecord_ltl_sur_rate;
									// itemQTYPalletArr[i].item_surcharge = custrecord_ltl_sur_item_surcharge;
								}
							});
						}
					}
					// log.debug('checkConfigLTLSurcharg 4', { itemQTYPalletArr });
				}
			}
			return Object.values(resultsItemLTLSurcharge);
		}

		/**
		 * รายการ item ที่เช็ต Pallet Size, Layer
		 * @param itemIdArr
		 * @returns
		 */
		function loadSSItemLtlSurcharge(itemIdArr) {
			let ssFilters = [];
			// Internal ID
			ssFilters.push({ "name": "internalid", "join": null, "operator": "is", "values": itemIdArr });
			const SS_ITEM_LTL_SURCHARGE = 'customsearch_ss_item_ltl_surcharge';
			var ssResults = libCode.loadSavedSearch(null, SS_ITEM_LTL_SURCHARGE, ssFilters, []);
			//console.log({ ssResults: ssResults.length });
			// log.debug(SS_ITEM_LTL_SURCHARGE, { ss_length: ssResults.length, ssFilters: ssFilters });
			let resultsLtlSurcharg = [];
			ssResults.forEach(function (row, index) {
				let internalid = row.getValue({ "name": "internalid", "label": "Internal ID" });
				let itemid = row.getValue({ "name": "itemid", "label": "Name" });
				let custitem_item_pallet_size = row.getValue({ "name": "custitem_item_pallet_size", "label": "Pallet Size" }) || '';
				let custitem_infor_layer = row.getValue({ "name": "custitem_infor_layer", "label": "Layer" }) || '';
				let subsidiary = row.getValue({ "name": "subsidiary", "label": "Subsidiary" });
				resultsLtlSurcharg.push({
					internalid,
					itemid,
					custitem_item_pallet_size,
					custitem_infor_layer,
					subsidiary,
				});
			});
			return resultsLtlSurcharg;
		}

		/**
		 * รายการ Setup LTL Surcharge
		 * @param param0
		 * @returns
		 */
		function loadSSLtlSurcharg({ trandate, palletSizeArr, palletLayerArr, currency, sales_channel, distributon, location }) {
			let ssFilters = [];
			// // Country Zone
			// ssFilters.push({ "name": "custrecord_ltl_sur_country_zone", "operator": "is", "values": "17" });
			// // Quantity Pallet
			// ssFilters.push({ "name": "custrecord_ltl_sur_qty_pallet", "operator": "is", "values": "10" });
			// // Pallet Size
			ssFilters.push({ "name": "custrecord_ltl_sur_pallet_size", "operator": "is", "values": palletSizeArr });
			// // Surcharge Rate
			// ssFilters.push({ "name": "custrecord_ltl_sur_rate", "operator": "is", "values": "200" });
			// // Currency
			ssFilters.push({ "name": "custrecord_ltl_sur_currency", "operator": "is", "values": currency });
			// // Country
			// ssFilters.push({ "name": "custrecord_ltl_sur_country", "operator": "is", "values": "177" });
			// // Pallet Layer
			ssFilters.push({ "name": "custrecord_ltl_sur_pallet_layer", "operator": "is", "values": palletLayerArr });
			// Date From
			ssFilters.push({ "name": "custrecord_ltl_sur_date_from", "operator": "onorbefore", "values": trandate });
			// Date to
			ssFilters.push({ "name": "custrecord_ltl_sur_date_to", "operator": "onorafter", "values": trandate });
			// Sales Channel
			ssFilters.push({ "name": "custrecord_ltl_sur_sales_channel", "join": null, "operator": "is", "values": sales_channel });
			// Distribution Channel
			ssFilters.push({ "name": "custrecord_ltl_sur_distributon_channel", "join": null, "operator": "is", "values": distributon });
			// Location
			ssFilters.push({ "name": "custrecord_ltl_sur_location", "join": null, "operator": "is", "values": location });
			const SS_LTL_SURCHARG = 'customsearch_ss_ltl_surcharg';
			var ssResults = libCode.loadSavedSearch(null, SS_LTL_SURCHARG, ssFilters, []);
			//console.log({ ssResults: ssResults.length });
			log.debug(SS_LTL_SURCHARG, { ss_length: ssResults.length, ssFilters: ssFilters });
			// ssResults.forEach(function (list) {
			//     console.log(list.getAllValues());
			// });
			return ssResults;
		}

		/**
		 *
		 * @param form
		 * @param params
		 * *
		 */
		function createBTN_EnterFobPrice(form, params = {}) {
			let urlToScript = url.resolveScript({
				scriptId: "customscript_sl_fob_price",
				deploymentId: 1,
				params: {
					step: '',
					...params,
				},
			});
			let script = ` var urlToScript = '${urlToScript}'; if (confirm('Would you like to Enter FOB Price?')) window.location.href=(urlToScript);`;
			form.addButton({
				id: 'custpage_btn_enter_fob_price',
				label: 'Enter FOB Price',
				functionName: script,
			});
		}

		/**
		 * - Is Shippingadvice = true
		 * - Shippingadvice Status = Draft SA
		 * - Update Shipping Advice to Confirmed
		 * @param form
		 * @param params
		 *
		 */
		function createBTN_ConfirmShippingAdvice(form, params = {}) {
			let urlToConfirmSA = url.resolveScript({
				scriptId: "customscript_sl_shipping_advice_export",
				deploymentId: 1,
				params: {
					step: 'CONFIRM_SHIPPING_ADVICE',
					...params,
				},
			});
			let script = ` var urlToConfirmSA = '${urlToConfirmSA}'; if (confirm('Would you like to Confirm Shipping Advice?')) window.location.href=(urlToConfirmSA);`;
			form.addButton({
				id: 'custpage_btn_confirm_sa',
				label: 'Confirm Shipping Advice',
				functionName: script,
			});
		}

		/**
		 * - Alert แจ้งเตือนให้กรอก FOB Price ก่อน Confirm Shipping Advice
		 * @param form
		 * @param params
		 *
		 */
		function createBTN_ConfirmShippingAdviceAlert(form, params = {}) {
			let urlToScript = url.resolveScript({
				scriptId: "customscript_sl_fob_price",
				deploymentId: 1,
				params: {
					step: '',
					...params,
				},
			});
			let script = ` var urlToScript = '${urlToScript}'; if (confirm('Please enter FOB Price before confirming Shipping Advice. \\nWould you like to Enter FOB Price?')) window.location.href=(urlToScript);`;

			// let script = `(alert('Please enter FOB Price before confirming Shipping Advice.'));`;
			form.addButton({
				id: 'custpage_btn_confirm_sa_alert',
				label: 'Confirm Shipping Advice',
				functionName: script,
			});
		}

		/**
		 * @param form
		 * @param params
		 * *
		 */
		function createBTN_CalContainer(form, params = {}) {

			let urlToScriptCalContainer = url.resolveScript({
				scriptId: "customscript_sl_recalculate_container",
				deploymentId: 1,
				params: {
					step: '',
					...params,
				},
			});

			let script = ` var urlToScriptCalContainer = '${urlToScriptCalContainer}'; if (confirm('Would you like to Calculate Container?')) window.location.href=(urlToScriptCalContainer);`;
			form.addButton({
				id: 'custpage_recalculate_container',
				label: 'Calculate Container',
				functionName: script,
			});
		}

		/**
		 *
		 * @param form
		 * @param params
		 */
		function createBTN_CloseCombine(form, params = {}) {
			let urlToCloseCombine = url.resolveScript({
				scriptId: "customscript_sl_combine_salesorder",
				deploymentId: 1,
				params: {
					step: 'CANCEL_COMBINE_CREATE_2',
					...params,
				},
			});
			let script = ` var urlToCloseCombine = '${urlToCloseCombine}'; if (confirm('Would you like to Close Combine?')) window.location.href=(urlToCloseCombine);`;
			form.addButton({
				id: 'custpage_btn_cancel_combine',
				label: 'Cancel Combine',
				functionName: script,
			});
		}

		/**
		 *
		 * @param form
		 * @param params
		 */
		function createBTN_CloseCombineDomestic(form, params = {}) {
			let urlToCloseCombine = url.resolveScript({
				scriptId: "customscript_sl_combine_salesorder",
				deploymentId: 1,
				params: {
					step: 'CANCEL_COMBINE_DOMESTIC',
					...params,
				},
			});
			let script = ` var urlToCloseCombine = '${urlToCloseCombine}'; if (confirm('Would you like to Close Combine?')) window.location.href=(urlToCloseCombine);`;
			form.addButton({
				id: 'custpage_btn_cancel_combine_domestic',
				label: 'Cancel Combine',
				functionName: script,
			});
		}

		/**
		 *
		 * @param form
		 * @param params
		 */
		function createBTN_UpdateShippingAdvice(form, params = {}) {
			let urlToShippingAdvice = url.resolveScript({
				scriptId: "customscript_sl_shipping_advice_export",
				deploymentId: 1,
				params: {
					step: 'UPDATE_SA_PAGE_1_SELECT_DATA',
					...params,
				},
			});
			let script = ` var urlToShippingAdvice = '${urlToShippingAdvice}'; if (confirm('Would you like to Edit Shipping Advice?')) window.location.href=(urlToShippingAdvice);`;
			form.addButton({
				id: 'custpage_btn_update_sa_page_1_select_data',
				label: 'Edit Shipping Advice',
				functionName: script,
			});
		}

		function convertQtyOnFromUnitToOtherUnit(unitTypeId, fromUnitId, toUnitName, qty) {
			toUnitName = String(toUnitName).toLowerCase();
			log.debug('convertQtyOnFromUnitToOtherUnit', 'unitTypeId: ' + unitTypeId + ', fromUnitId: ' + fromUnitId + ', toUnitName: ' + toUnitName + ', qty: ' + qty);
			// Load the unit type record
			if (!DB_UNITTYPE[unitTypeId]) DB_UNITTYPE[unitTypeId] = record.load({type: 'unitstype', id: unitTypeId, isDynamic: false});

			var unitTypeRec = DB_UNITTYPE[unitTypeId];
			var lineCount = unitTypeRec.getLineCount('uom');
			var fromRate = null;
			var toRate = null;

			for (var i = 0; i < lineCount; i++) {
				var unitId = unitTypeRec.getSublistValue({sublistId: 'uom', fieldId: 'internalid', line: i});
				var unitName = unitTypeRec.getSublistValue({sublistId: 'uom', fieldId: 'unitname', line: i});
				var rate = unitTypeRec.getSublistValue({sublistId: 'uom', fieldId: 'conversionrate', line: i});
				if (unitId == fromUnitId) fromRate = rate;
				if (toRate === null && String(unitName).toLowerCase() == toUnitName) toRate = rate;
			}

			if (toRate === null) return null;
			var newQty = libCode.multipliedNumber(qty, libCode.dividedNumber(fromRate, toRate));

			log.debug('convertQtyOnFromUnitToOtherUnit', 'fromRate: ' + fromRate + ', toRate: ' + toRate + ', newQty: ' + newQty);
			return newQty
		}

        /**
         * SS - Customer and Payment Terms - CS
         * @param customer_internal_id
         * @returns
         */
        function loadSSCustomerPaymentTerms(customer_internal_id) {
            if (CUSTOMER_PAYMENT_TERMS[customer_internal_id]) {
                return CUSTOMER_PAYMENT_TERMS[customer_internal_id];
            }
            let ssFilters = [];
            // Customer Internal ID
            ssFilters.push({ "name": "internalid", join: "null", "operator": "is", "values": customer_internal_id });
            const SS_CUSTOMER_PAYMENT_TERMS = 'customsearch_ss_customer_payment_terms';
            var ssResults = libCode.loadSavedSearch(null, SS_CUSTOMER_PAYMENT_TERMS, ssFilters, []);
            //console.log({ ssResults: ssResults.length });
            log.debug(SS_CUSTOMER_PAYMENT_TERMS, { ss_length: ssResults.length, ssFilters: ssFilters });
            ssResults.forEach(function (row) {
                let customer_internal_id = row.getValue({ "name": "internalid", "label": "Customer Internal ID" });
                let name = row.getValue({ "name": "altname", "label": "Name" });
                let internal_payment_terms_days = row.getValue({ "name": "custentity_cust_internal_payment_terms", "label": "Internal Payment Terms (Days)" });
                let payment_terms_id = row.getValue({ "name": "internalid", "join": "CUSTENTITY_CUST_PAYMENT_TERMS", "label": "Payment Terms Internal ID" });
                let days_till_net_due = row.getValue({ "name": "custrecord_payment_term_net_due", "join": "CUSTENTITY_CUST_PAYMENT_TERMS", "label": "Days Till Net Due" }) || 0;
                let bl_date = row.getValue({ "name": "custrecord_bl_date", "join": "CUSTENTITY_CUST_PAYMENT_TERMS", "label": "BL Date" }) || false;
                let end_of_month = row.getValue({ "name": "custrecord_end_of_month", "join": "CUSTENTITY_CUST_PAYMENT_TERMS", "label": " End Of Month" }) || false;
                let domestic_export = row.getValue({ "name": "custentity_dom_or_export", "label": "Domestic/Export" });
                if (!!customer_internal_id) {
                    if (CUSTOMER_PAYMENT_TERMS[customer_internal_id] === undefined) {
                        CUSTOMER_PAYMENT_TERMS[customer_internal_id] = {
                            customer_internal_id: customer_internal_id,
                            name: name,
                            internal_payment_terms_days: Number(internal_payment_terms_days) || 0,
                            domestic_export: domestic_export,
                            payment_terms_list: {},
                        };
                    }
                    if (payment_terms_id) {
                        if (CUSTOMER_PAYMENT_TERMS[customer_internal_id].payment_terms_list[payment_terms_id] === undefined) {
                            CUSTOMER_PAYMENT_TERMS[customer_internal_id].payment_terms_list[payment_terms_id] = {
                                end_of_month: end_of_month,
                                bl_date: bl_date,
                                days_till_net_due: Number(days_till_net_due),
                            };
                        }
                    }
                }
            });
            return CUSTOMER_PAYMENT_TERMS;
            // return ssResults;
        }

        function checkLTL(cRecord) {
            function getLookupFields(type, id, columns) {
                let results = {};
                try {
                    const resultObj = search.lookupFields({
                        type: type,
                        id: id,
                        columns: columns
                    });
                    Object.keys(resultObj).forEach(function (key) {
                        const value = resultObj[key];
                        if (typeof value !== 'string' && typeof value !== 'number') {
                            if (Array.isArray(value) && value.length === 1) {
                                results[key] = value[0].value || '';
                                if (value[0].text) {
                                    results[key + '_text'] = value[0].text || '';
                                }
                            }
                            else if (Array.isArray(value) && value.length === 0) {
                                results[key] = null;
                            }
                            else {
                                results[key] = value;
                            }
                        }
                        else {
                            results[key] = value;
                        }
                    });
                    return results;
                }
                catch (error) {
                    // กรณี error ให้ return object เปล่าที่ถูก cast เป็นชนิด T
                    return {};
                }
            }

            function DateFormat(dateStr, defaultValue = '') {
                if (!!dateStr) {
                    return format.format({ value: dateStr, type: format.Type.DATE, timezone: format.Timezone.ASIA_BANGKOK });
                }
                return defaultValue;
            }

            let shippingaddress = cRecord.getValue({ fieldId: 'shippingaddress' });
            let resultAddressObj = getLookupFields('address', shippingaddress, ['zip', 'country']);
            log.debug({ title: 'Result Address Object', details: resultAddressObj });
            let postCode = resultAddressObj?.zip || '';
            let sales_channel = cRecord.getValue({ fieldId: 'cseg_sale_channel' });
            let distributon = cRecord.getValue({ fieldId: 'cseg_dist_chanl' });
            let locationId = cRecord.getValue({ fieldId: 'location' });
            let country = 'France';
            let trandate = cRecord.getValue({ fieldId: 'trandate' });
            let currency = cRecord.getValue({ fieldId: 'currency' }) || '1';
            let dateFrom = DateFormat(trandate);

            log.debug({
                title: 'LTL Params', details: {
                    postCode,
                    sales_channel,
                    distributon,
                    locationId,
                    country,
                    trandate,
                    currency,
                    dateFrom,
                }
            });

            let itemQTYPalletObj = {};
            if (sales_channel && distributon && locationId) {
                for (let i = 0; i < cRecord.getLineCount({ sublistId: 'item' }); i++) {
                    let custcolQtyPallet = cRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_qty_pallet', line: i });
                    let convOfUnitPallet = cRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_conv_of_unit_pal', line: i });
                    let item = cRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
                    let custcolLtlItem = cRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_ltl_item', line: i });
                    if (custcolLtlItem === true) {
                        continue;
                    }
                    // let keys = item = 'item_' + item;
                    if (convOfUnitPallet) {
                        if (itemQTYPalletObj[item] === undefined) {
                            itemQTYPalletObj[item] = {
                                item,
                                qty_pallet: 0,
                                qty_conv_pallet: 0,
                                post_code: postCode,
                                pallet_size: '',
                                pallet_layer: '',
                                surcharge_rate: 0,
                                currency: currency,
                                country: country,
                                sales_channel,
                                distributon,
                                locationId: locationId,
                            };
                        }
                        itemQTYPalletObj[item].qty_pallet = libCode.addNumber(itemQTYPalletObj[item]?.qty_pallet || 0, custcolQtyPallet);
                        itemQTYPalletObj[item].qty_conv_pallet = libCode.addNumber(itemQTYPalletObj[item]?.qty_conv_pallet || 0, convOfUnitPallet);
                        /*
                        itemListArr.push(item);
                        itemQTYPalletArr.push({
                            item,
                            qty_pallet: custcolQtyPallet,
                            post_code: postCode,
                            pallet_size: '',
                            pallet_layer: '',
                            surcharge_rate: 0,
                            currency: currency,
                            country: country,
                            sales_channel,
                            distributon,
                            location
                        });
                        */
                    }
                }

                let itemQTYPalletArr = Object.values(itemQTYPalletObj);
                let itemListArr = Object.keys(itemQTYPalletObj);
                log.debug({ title: 'itemQTYPalletObj', details: itemQTYPalletObj });
                
                try {
                    if (itemQTYPalletArr.length > 0 && itemListArr.length > 0) {
                        let resultsItemLTLSurcharge = checkConfigLTLSurcharg({ trandate: dateFrom, itemQTYPalletArr, itemListArr, currency, sales_channel, distributon, location: locationId });
                        log.debug({ title: 'resultsItemLTLSurcharge', details: resultsItemLTLSurcharge });

                        // let flagSave = false;
                        // if (resultsItemLTLSurcharge.length > 0) {
                        // 	let cRecord = record.load({ type: recordType, id: recordId, isDynamic: true });
                        // 	for (let r = cRecord.getLineCount({ sublistId: 'item' }) - 1; r >= 0; r--) {
                        // 		let custcolLtlItem = cRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_ltl_item', line: r });
                        // 		// ลบแถวที่เป็น Item Surcharge ออก
                        // 		if (custcolLtlItem === true) {
                        // 			cRecord.removeLine({ sublistId: 'item', line: r });
                        // 		}
                        // 	}
                        // 	resultsItemLTLSurcharge.forEach(function (row, index) {
                        // 		const { item_surcharge = '', rate_surcharge = 0 } = row;
                        // 		if (!!item_surcharge && !!rate_surcharge) {
                        // 			flagSave = true;
                        // 			cRecord.selectNewLine({ sublistId: 'item' });
                        // 			cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: item_surcharge, forceSyncSourcing: true });
                        // 			cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'amount', value: rate_surcharge, forceSyncSourcing: true });
                        // 			cRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_ltl_item', value: true, forceSyncSourcing: true });
                        // 			cRecord.commitLine({ sublistId: 'item' });
                        // 		}
                        // 	});
                        // 	if (flagSave) {
                        // 	}
                        // }
                    }
                    log.debug({ title: '_UE_Sales_Order_AfterSubmit | shipAddressList', details: { resultAddressObj, shippingaddress, itemQTYPalletArr } });
                } catch (error) {
                    log.debug({
                        title: '_UE_Sales_Order_AfterSubmit | LTL_SURCHARGE ',
                        details: error,
                    });
                }
            }

        }

		//@ts-ignore
		return {
			beforeLoad: _UE_Sales_Order_BeforeLoad,
			// beforeSubmit: _UE_Sales_Order_BeforeSubmit,
			afterSubmit: _UE_Sales_Order_AfterSubmit,
		};
	});

