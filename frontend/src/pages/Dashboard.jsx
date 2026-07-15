import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Ticket, Clock, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';
import { getLeads, getTickets } from '../services/api';

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ color }}>
        <Icon size={28} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [leadsData, ticketsData] = await Promise.all([
          getLeads(),
          getTickets(),
        ]);
        setLeads(Array.isArray(leadsData) ? leadsData : []);
        setTickets(Array.isArray(ticketsData) ? ticketsData : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="loading-spinner">Loading dashboard…</div>;
  if (error) return <div className="empty-state"><AlertCircle size={32} /> {error}</div>;

  const newLeads = leads.filter((l) => l.status === 'NEW').length;
  const openTickets = tickets.filter((t) => !['COMPLETED', 'CLOSED', 'DONE'].includes(t.status)).length;
  const runningTimers = tickets.filter((t) => t.time_entries?.some((e) => e.is_running)).length;
  const today = new Date().toISOString().split('T')[0];
  const closedToday = tickets.filter((t) => t.closed_at && t.closed_at.startsWith(today)).length;

  const recentLeads = leads
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  const recentTickets = tickets
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 5);

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of leads, tickets, and activity</p>
      </div>

      <div className="stats-grid">
        <StatCard icon={Inbox} label="New Leads" value={newLeads} color="#7c83ff" />
        <StatCard icon={Ticket} label="Open Tickets" value={openTickets} color="#2563eb" />
        <StatCard icon={Clock} label="Running Timers" value={runningTimers} color="#16a34a" />
        <StatCard icon={CheckCircle} label="Closed Today" value={closedToday} color="#333" />
      </div>

      <div className="two-col">
        {/* Recent Leads */}
        <div className="card">
          <div className="card-title flex justify-between items-center">
            <span>Recent Leads</span>
            <Link to="/leads" className="text-sm" style={{ color: '#7c83ff' }}>
              View all →
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <div className="empty-state text-sm">No leads yet</div>
          ) : (
            <div>
              {recentLeads.map((lead) => (
                <Link
                  key={lead.id}
                  to={`/leads?leadId=${lead.id}`}
                  className="flex items-center justify-between"
                  style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textDecoration: 'none', color: 'inherit' }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {lead.subject || lead.sender_email}
                    </div>
                    <div className="text-xs text-muted">
                      {lead.source} · {lead.sender_name || lead.sender_email} ·{' '}
                      {new Date(lead.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge badge-${lead.status}`}>{lead.status}</span>
                    <ChevronRight size={14} color="#999" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recently Updated Tickets */}
        <div className="card">
          <div className="card-title flex justify-between items-center">
            <span>Recently Updated Tickets</span>
            <Link to="/tickets" className="text-sm" style={{ color: '#7c83ff' }}>
              View all →
            </Link>
          </div>
          {recentTickets.length === 0 ? (
            <div className="empty-state text-sm">No tickets yet</div>
          ) : (
            <div>
              {recentTickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  to={`/tickets/${ticket.id}`}
                  className="flex items-center justify-between"
                  style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      #{ticket.id} {ticket.title}
                    </div>
                    <div className="text-xs text-muted">
                      {ticket.client_name || 'No client'} ·{' '}
                      {new Date(ticket.updated_at || ticket.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge badge-${ticket.status}`}>{ticket.status.replace(/_/g, ' ')}</span>
                    <ChevronRight size={14} color="#999" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
