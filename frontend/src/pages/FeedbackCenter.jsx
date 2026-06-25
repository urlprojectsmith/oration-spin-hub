import { BarChart3, EyeOff, MessageSquare, Plus, RefreshCw, Save, Send, Sparkles, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

const emptyForm = {
  event_id: '',
  title: 'Event Feedback',
  description: 'Share your session rating, suggestions, and takeaways.',
  anonymous_mode: false,
  auto_trigger: true
};

const defaultQuestions = [
  { question_type: 'star_rating', prompt: 'How was the session?', required: true, optionsText: '' },
  { question_type: 'emoji_rating', prompt: 'How did the session feel?', required: false, optionsText: 'Great\nGood\nOkay\nPoor' },
  { question_type: 'multiple_choice', prompt: 'What was most useful?', required: false, optionsText: 'Content\nSpeaker\nExamples\nQ&A' },
  { question_type: 'text', prompt: 'Suggestions or comments?', required: false, optionsText: '' },
  { question_type: 'nps', prompt: 'Would you recommend this session?', required: true, optionsText: '' }
];

function lines(value) {
  return String(value || '').split('\n').map((item) => item.trim()).filter(Boolean);
}

export default function FeedbackCenter() {
  const [events, setEvents] = useState([]);
  const [forms, setForms] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [questions, setQuestions] = useState(defaultQuestions);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const [eventRows, formRows, dashboardData] = await Promise.all([
      api('/events'),
      api('/feedback/forms'),
      api('/feedback/dashboard')
    ]);
    setEvents(eventRows);
    setForms(formRows);
    setDashboard(dashboardData);
    if (!form.event_id && eventRows[0]) setForm((current) => ({ ...current, event_id: eventRows[0].id }));
  }

  useEffect(() => {
    load();
  }, []);

  async function saveForm(event) {
    event.preventDefault();
    await api('/feedback/forms', {
      method: 'POST',
      body: {
        ...form,
        questions: questions.map((item, index) => ({
          question_type: item.question_type,
          prompt: item.prompt,
          required: item.required,
          options: lines(item.optionsText),
          sort_order: index
        }))
      }
    });
    setMessage('Feedback form saved.');
    await load();
  }

  async function trigger() {
    await api(`/feedback/events/${form.event_id}/trigger`, { method: 'POST', body: { message: 'Please share feedback for this event.' } });
    setMessage('Manual feedback trigger sent.');
  }

  async function summarize() {
    setSummary(await api('/feedback/summary', { method: 'POST', body: { event_id: form.event_id || undefined } }));
  }

  async function moderate(response, action) {
    await api(`/feedback/responses/${response.id}/moderate`, { method: 'PATCH', body: { action } });
    await load();
  }

  function addQuestion() {
    setQuestions([...questions, { question_type: 'text', prompt: '', required: false, optionsText: '' }]);
  }

  function updateQuestion(index, patch) {
    setQuestions(questions.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <>
      <PageHeader
        title="Feedback Center"
        kicker="forms, triggers, moderation, analytics"
        actions={
          <button className="secondary-btn" onClick={load}>
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />
      {message ? <div className="toast-inline page-toast">{message}</div> : null}

      <section className="feedback-layout">
        <aside className="panel feedback-builder">
          <div className="panel-title">
            <MessageSquare size={20} />
            Feedback Builder
          </div>
          <form onSubmit={saveForm}>
            <select value={form.event_id} onChange={(event) => setForm({ ...form, event_id: event.target.value })} required>
              <option value="">Select event</option>
              {events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            <div className="toggle-grid">
              <label className="check-row">
                <input type="checkbox" checked={form.auto_trigger} onChange={(event) => setForm({ ...form, auto_trigger: event.target.checked })} />
                Automatic trigger
              </label>
              <label className="check-row">
                <input type="checkbox" checked={form.anonymous_mode} onChange={(event) => setForm({ ...form, anonymous_mode: event.target.checked })} />
                Anonymous mode
              </label>
            </div>
            <div className="feedback-question-list">
              {questions.map((question, index) => (
                <article key={index}>
                  <div className="form-grid-2">
                    <select value={question.question_type} onChange={(event) => updateQuestion(index, { question_type: event.target.value })}>
                      <option value="star_rating">Star Rating</option>
                      <option value="emoji_rating">Emoji Rating</option>
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="text">Text Feedback</option>
                      <option value="nps">NPS Score</option>
                    </select>
                    <label className="check-row">
                      <input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(index, { required: event.target.checked })} />
                      Required
                    </label>
                  </div>
                  <input placeholder="Question prompt" value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} required />
                  {['multiple_choice', 'emoji_rating'].includes(question.question_type) ? (
                    <textarea placeholder="Options, one per line" value={question.optionsText} onChange={(event) => updateQuestion(index, { optionsText: event.target.value })} />
                  ) : null}
                </article>
              ))}
            </div>
            <button type="button" className="secondary-btn" onClick={addQuestion}><Plus size={16} />Add Question</button>
            <button className="primary-btn"><Save size={16} />Save Form</button>
          </form>
          <button className="secondary-btn" onClick={trigger} disabled={!form.event_id}><Send size={16} />Manual Trigger</button>
        </aside>

        <main className="feedback-main">
          <section className="panel">
            <div className="panel-title">
              <BarChart3 size={20} />
              Event Rating Dashboard
            </div>
            <div className="analytics-grid">
              <div><span>Average Rating</span><strong>{dashboard?.summary?.average_rating || 0}</strong></div>
              <div><span>Total Responses</span><strong>{dashboard?.summary?.total_responses || 0}</strong></div>
              <div><span>Average NPS</span><strong>{dashboard?.summary?.average_nps || 0}</strong></div>
              <div><span>Positive / Negative</span><strong>{dashboard?.summary?.positive_count || 0}/{dashboard?.summary?.negative_count || 0}</strong></div>
            </div>
            <div className="trend-list">
              {(dashboard?.trends || []).map((item) => (
                <div key={item.day}>
                  <strong>{new Date(item.day).toLocaleDateString()}</strong>
                  <span>{item.responses} responses - {item.average_rating} avg</span>
                </div>
              ))}
              {!dashboard?.trends?.length ? <div className="empty-state">No feedback trends yet.</div> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <Sparkles size={20} />
              AI Feedback Summary
            </div>
            <button className="secondary-btn" onClick={summarize}><Sparkles size={16} />Generate Summary</button>
            {summary ? (
              <div className="summary-grid">
                <article><strong>Positive Highlights</strong><span>{summary.positive_highlights.join(' ')}</span></article>
                <article><strong>Improvement Areas</strong><span>{summary.improvement_areas.join(' ')}</span></article>
                <article><strong>Common Suggestions</strong><span>{summary.common_suggestions.join(' ')}</span></article>
                <article><strong>Sentiment</strong><span>{summary.sentiment_analysis}</span></article>
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-title">
              <EyeOff size={20} />
              Feedback Moderation
            </div>
            <div className="feedback-response-list">
              {(dashboard?.responses || []).map((response) => (
                <article key={response.id}>
                  <div>
                    <span className="kicker">{response.event_title}</span>
                    <strong>{response.user_name || response.employee_name || 'Anonymous'}</strong>
                    <small>{response.sentiment} - {response.overall_rating || 'No'} rating - {response.moderation_status}</small>
                  </div>
                  <div className="feedback-answer-preview">
                    {(response.answers || []).slice(0, 3).map((answer) => (
                      <span key={answer.question}>{answer.question}: {String(Array.isArray(answer.answer) ? answer.answer.join(', ') : answer.answer)}</span>
                    ))}
                  </div>
                  <div className="row-actions">
                    <button title="Approve" onClick={() => moderate(response, 'approve')}><Star size={15} /></button>
                    <button title="Hide" onClick={() => moderate(response, 'hide')}><EyeOff size={15} /></button>
                    <button title="Delete" onClick={() => moderate(response, 'delete')}><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
              {!dashboard?.responses?.length ? <div className="empty-state">No feedback responses yet.</div> : null}
            </div>
          </section>
        </main>

        <aside className="panel feedback-forms-panel">
          <div className="panel-title">
            <MessageSquare size={20} />
            Forms
          </div>
          <div className="feedback-form-list">
            {forms.map((item) => (
              <button key={item.id} onClick={() => {
                setForm({
                  event_id: item.event_id,
                  title: item.title,
                  description: item.description || '',
                  anonymous_mode: item.anonymous_mode,
                  auto_trigger: item.auto_trigger
                });
                setQuestions((item.questions || []).map((question) => ({
                  question_type: question.question_type,
                  prompt: question.prompt,
                  required: question.required,
                  optionsText: (question.options || []).join('\n')
                })));
              }}>
                <strong>{item.title}</strong>
                <span>{item.event_title}</span>
                <small>{item.anonymous_mode ? 'Anonymous' : 'Named'} - {item.auto_trigger ? 'Auto' : 'Manual'}</small>
              </button>
            ))}
            {!forms.length ? <div className="empty-state">No feedback forms yet.</div> : null}
          </div>
        </aside>
      </section>
    </>
  );
}
