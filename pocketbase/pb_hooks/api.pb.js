/// <reference path="../pb_data/types.d.ts" />
//
// /api compatibility layer — thin route registrations. Each handler runs in an
// isolated VM, so it require()s ./lib.js at call time and delegates. The
// frontend is unchanged; it still calls /api/* same-origin.

const L = () => require(`${__hooks}/lib.js`);
const auth = () => $apis.requireRecordAuth();

// auth
routerAdd("POST", "/api/auth/login", (c) => require(`${__hooks}/lib.js`).login(c));
routerAdd("POST", "/api/auth/refresh", (c) => require(`${__hooks}/lib.js`).refresh(c), $apis.requireRecordAuth());
routerAdd("GET", "/api/auth/me", (c) => require(`${__hooks}/lib.js`).me(c), $apis.requireRecordAuth());

// users
routerAdd("GET", "/api/users", (c) => require(`${__hooks}/lib.js`).listUsers(c), $apis.requireRecordAuth());

// clients
routerAdd("GET", "/api/clients", (c) => require(`${__hooks}/lib.js`).listClients(c), $apis.requireRecordAuth());
routerAdd("GET", "/api/clients/:id", (c) => require(`${__hooks}/lib.js`).getClient(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/clients", (c) => require(`${__hooks}/lib.js`).createClient(c), $apis.requireRecordAuth());
routerAdd("PATCH", "/api/clients/:id", (c) => require(`${__hooks}/lib.js`).updateClient(c), $apis.requireRecordAuth());
routerAdd("GET", "/api/clients/:id/members", (c) => require(`${__hooks}/lib.js`).listClientMembers(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/clients/:id/members", (c) => require(`${__hooks}/lib.js`).createClientMember(c), $apis.requireRecordAuth());
routerAdd("PATCH", "/api/clients/:id/members/:memberId", (c) => require(`${__hooks}/lib.js`).updateClientMember(c), $apis.requireRecordAuth());
routerAdd("DELETE", "/api/clients/:id/members/:memberId", (c) => require(`${__hooks}/lib.js`).deleteClientMember(c), $apis.requireRecordAuth());

// leads
routerAdd("GET", "/api/leads", (c) => require(`${__hooks}/lib.js`).listLeads(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/leads", (c) => require(`${__hooks}/lib.js`).createLead(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/leads/:id/review", (c) => require(`${__hooks}/lib.js`).reviewLead(c), $apis.requireRecordAuth());

// tickets
routerAdd("GET", "/api/tickets", (c) => require(`${__hooks}/lib.js`).listTickets(c), $apis.requireRecordAuth());
routerAdd("GET", "/api/tickets/:id", (c) => require(`${__hooks}/lib.js`).getTicket(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets", (c) => require(`${__hooks}/lib.js`).createTicket(c), $apis.requireRecordAuth());
routerAdd("PATCH", "/api/tickets/:id", (c) => require(`${__hooks}/lib.js`).updateTicket(c), $apis.requireRecordAuth());
routerAdd("DELETE", "/api/tickets/:id", (c) => require(`${__hooks}/lib.js`).deleteTicket(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets/:id/close", (c) => require(`${__hooks}/lib.js`).closeTicket(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets/:id/move", (c) => require(`${__hooks}/lib.js`).moveTicket(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets/:id/copy", (c) => require(`${__hooks}/lib.js`).copyTicket(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets/:id/archive", (c) => require(`${__hooks}/lib.js`).archiveTicket(c, true), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets/:id/unarchive", (c) => require(`${__hooks}/lib.js`).archiveTicket(c, false), $apis.requireRecordAuth());
routerAdd("GET", "/api/tickets/:id/members", (c) => require(`${__hooks}/lib.js`).listTicketMembers(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets/:id/members", (c) => require(`${__hooks}/lib.js`).addTicketMember(c), $apis.requireRecordAuth());
routerAdd("DELETE", "/api/tickets/:id/members/:userId", (c) => require(`${__hooks}/lib.js`).removeTicketMember(c), $apis.requireRecordAuth());

// ticket labels (associations)
routerAdd("GET", "/api/tickets/:id/labels", (c) => require(`${__hooks}/lib.js`).ticketLabelsList(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets/:id/labels", (c) => require(`${__hooks}/lib.js`).addTicketLabel(c), $apis.requireRecordAuth());
routerAdd("DELETE", "/api/tickets/:id/labels/:labelId", (c) => require(`${__hooks}/lib.js`).removeTicketLabel(c), $apis.requireRecordAuth());

// checklists
routerAdd("GET", "/api/tickets/:id/checklists", (c) => require(`${__hooks}/lib.js`).listChecklists(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets/:id/checklists", (c) => require(`${__hooks}/lib.js`).createChecklist(c), $apis.requireRecordAuth());
routerAdd("PUT", "/api/checklists/:id", (c) => require(`${__hooks}/lib.js`).updateChecklist(c), $apis.requireRecordAuth());
routerAdd("DELETE", "/api/checklists/:id", (c) => require(`${__hooks}/lib.js`).deleteChecklist(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/checklists/:id/items", (c) => require(`${__hooks}/lib.js`).addChecklistItem(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/checklists/:id/toggle-all", (c) => require(`${__hooks}/lib.js`).toggleAllChecklistItems(c), $apis.requireRecordAuth());
routerAdd("PUT", "/api/checklist-items/:id", (c) => require(`${__hooks}/lib.js`).updateChecklistItem(c), $apis.requireRecordAuth());
routerAdd("DELETE", "/api/checklist-items/:id", (c) => require(`${__hooks}/lib.js`).deleteChecklistItem(c), $apis.requireRecordAuth());

// attachments
routerAdd("GET", "/api/tickets/:id/attachments", (c) => require(`${__hooks}/lib.js`).listAttachments(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets/:id/attachments", (c) => require(`${__hooks}/lib.js`).uploadAttachment(c), $apis.requireRecordAuth());
routerAdd("DELETE", "/api/attachments/:id", (c) => require(`${__hooks}/lib.js`).deleteAttachment(c), $apis.requireRecordAuth());

// activity
routerAdd("GET", "/api/tickets/:id/activity", (c) => require(`${__hooks}/lib.js`).listActivity(c), $apis.requireRecordAuth());

// comments
routerAdd("GET", "/api/comments/ticket/:id", (c) => require(`${__hooks}/lib.js`).listComments(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/comments", (c) => require(`${__hooks}/lib.js`).createComment(c), $apis.requireRecordAuth());

// time
routerAdd("GET", "/api/tickets/:id/time", (c) => require(`${__hooks}/lib.js`).listTime(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets/:id/time/start", (c) => require(`${__hooks}/lib.js`).startTime(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets/:id/time/stop", (c) => require(`${__hooks}/lib.js`).stopTime(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/tickets/:id/time/manual", (c) => require(`${__hooks}/lib.js`).manualTime(c), $apis.requireRecordAuth());
routerAdd("PATCH", "/api/tickets/:id/time/:entryId", (c) => require(`${__hooks}/lib.js`).updateTime(c), $apis.requireRecordAuth());
routerAdd("DELETE", "/api/tickets/:id/time/:entryId", (c) => require(`${__hooks}/lib.js`).deleteTime(c), $apis.requireRecordAuth());

// board
routerAdd("GET", "/api/board", (c) => require(`${__hooks}/lib.js`).board(c), $apis.requireRecordAuth());
routerAdd("GET", "/api/board/stats", (c) => require(`${__hooks}/lib.js`).boardStats(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/board/reorder", (c) => require(`${__hooks}/lib.js`).reorderBoard(c), $apis.requireRecordAuth());

// labels (global palette)
routerAdd("GET", "/api/labels", (c) => require(`${__hooks}/lib.js`).listLabels(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/labels", (c) => require(`${__hooks}/lib.js`).createLabel(c), $apis.requireRecordAuth());
routerAdd("PUT", "/api/labels/:id", (c) => require(`${__hooks}/lib.js`).updateLabel(c), $apis.requireRecordAuth());
routerAdd("DELETE", "/api/labels/:id", (c) => require(`${__hooks}/lib.js`).deleteLabel(c), $apis.requireRecordAuth());

// invoices (static paths before :id so /reports and /unbilled never match as ids)
routerAdd("GET", "/api/invoices", (c) => require(`${__hooks}/lib.js`).listInvoices(c), $apis.requireRecordAuth());
routerAdd("GET", "/api/invoices/reports", (c) => require(`${__hooks}/lib.js`).invoiceReports(c), $apis.requireRecordAuth());
routerAdd("GET", "/api/invoices/unbilled", (c) => require(`${__hooks}/lib.js`).unbilledTime(c), $apis.requireRecordAuth());
routerAdd("GET", "/api/invoices/:id", (c) => require(`${__hooks}/lib.js`).getInvoice(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/invoices", (c) => require(`${__hooks}/lib.js`).createInvoice(c), $apis.requireRecordAuth());
routerAdd("PATCH", "/api/invoices/:id", (c) => require(`${__hooks}/lib.js`).updateInvoice(c), $apis.requireRecordAuth());
routerAdd("DELETE", "/api/invoices/:id", (c) => require(`${__hooks}/lib.js`).deleteInvoice(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/invoices/:id/send", (c) => require(`${__hooks}/lib.js`).sendInvoice(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/invoices/:id/mark-paid", (c) => require(`${__hooks}/lib.js`).markInvoicePaid(c), $apis.requireRecordAuth());

// knowledge base
routerAdd("GET", "/api/kb", (c) => require(`${__hooks}/lib.js`).listKB(c), $apis.requireRecordAuth());
routerAdd("GET", "/api/kb/:id", (c) => require(`${__hooks}/lib.js`).getKB(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/kb", (c) => require(`${__hooks}/lib.js`).createKB(c), $apis.requireRecordAuth());
routerAdd("PATCH", "/api/kb/:id", (c) => require(`${__hooks}/lib.js`).updateKB(c), $apis.requireRecordAuth());
routerAdd("DELETE", "/api/kb/:id", (c) => require(`${__hooks}/lib.js`).deleteKB(c), $apis.requireRecordAuth());

// voice & AI settings
routerAdd("GET", "/api/settings/voice-agent", (c) => require(`${__hooks}/lib.js`).voiceGet(c), $apis.requireRecordAuth());
routerAdd("PATCH", "/api/settings/voice-agent", (c) => require(`${__hooks}/lib.js`).voiceSet(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/settings/voice-agent", (c) => require(`${__hooks}/lib.js`).voiceSet(c), $apis.requireRecordAuth());

// call logs
routerAdd("GET", "/api/call-logs", (c) => require(`${__hooks}/lib.js`).listCallLogs(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/call-logs", (c) => require(`${__hooks}/lib.js`).createCallLog(c), $apis.requireRecordAuth());
routerAdd("GET", "/api/call-logs/stats", (c) => require(`${__hooks}/lib.js`).callLogStats(c), $apis.requireRecordAuth());

// poppy (optional integration — graceful stubs)
routerAdd("GET", "/api/poppy/boards", (c) => require(`${__hooks}/lib.js`).poppyBoards(c), $apis.requireRecordAuth());
routerAdd("GET", "/api/poppy/chats/:boardId", (c) => require(`${__hooks}/lib.js`).poppyChats(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/poppy/ask", (c) => require(`${__hooks}/lib.js`).poppyAsk(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/poppy/conversation", (c) => require(`${__hooks}/lib.js`).poppyConversation(c), $apis.requireRecordAuth());
routerAdd("POST", "/api/poppy/conversation/:conversationId", (c) => require(`${__hooks}/lib.js`).poppyConversation(c), $apis.requireRecordAuth());
