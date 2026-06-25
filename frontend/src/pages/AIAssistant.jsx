import { Bot, Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

const quickQuestions = [
  'Who has not spoken this month?',
  'Who is next in queue?',
  'Top speakers',
  'Low participation employees'
];

export default function AIAssistant() {
  const [question, setQuestion] = useState(quickQuestions[0]);
  const [answer, setAnswer] = useState(null);
  const [outlineForm, setOutlineForm] = useState({ topic: '', audience: 'office audience', duration: '20 minutes', save: false });
  const [outline, setOutline] = useState(null);

  async function ask(event) {
    event.preventDefault();
    setAnswer(await api('/ai/admin-assistant', { method: 'POST', body: { question } }));
  }

  async function generateOutline(event) {
    event.preventDefault();
    const result = await api('/ai/outlines/generate', { method: 'POST', body: outlineForm });
    setOutline(result.outline);
  }

  return (
    <>
      <PageHeader title="AI Assistant" kicker="admin insights and speech outlines" />

      <section className="assistant-layout">
        <section className="panel assistant-panel">
          <div className="panel-title">
            <Bot size={20} />
            Admin Assistant
          </div>
          <div className="quick-question-grid">
            {quickQuestions.map((item) => (
              <button className={question === item ? 'active' : ''} key={item} onClick={() => setQuestion(item)}>
                {item}
              </button>
            ))}
          </div>
          <form className="assistant-form" onSubmit={ask}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} />
            <button className="primary-btn">
              <Send size={16} />
              Ask
            </button>
          </form>

          {answer ? (
            <div className="assistant-answer">
              <strong>{answer.answer}</strong>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {answer.rows.map((row, index) => (
                      <tr key={index}>
                        {Object.entries(row).map(([key, value]) => (
                          <td key={key}>
                            <span className="kicker">{key.replaceAll('_', ' ')}</span>
                            <strong>{String(value ?? '-')}</strong>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel assistant-panel">
          <div className="panel-title">
            <Sparkles size={20} />
            AI Speech Outline Generator
          </div>
          <form className="outline-form" onSubmit={generateOutline}>
            <input placeholder="Speech topic" value={outlineForm.topic} onChange={(event) => setOutlineForm({ ...outlineForm, topic: event.target.value })} required />
            <div className="form-grid-2">
              <input placeholder="Audience" value={outlineForm.audience} onChange={(event) => setOutlineForm({ ...outlineForm, audience: event.target.value })} />
              <input placeholder="Duration" value={outlineForm.duration} onChange={(event) => setOutlineForm({ ...outlineForm, duration: event.target.value })} />
            </div>
            <label className="check-row">
              <input type="checkbox" checked={outlineForm.save} onChange={(event) => setOutlineForm({ ...outlineForm, save: event.target.checked })} />
              Save generated outline
            </label>
            <button className="secondary-btn">
              <Sparkles size={16} />
              Generate Outline
            </button>
          </form>

          {outline ? (
            <div className="outline-result">
              <h2>{outline.title}</h2>
              {['introduction', 'main_points', 'examples', 'conclusion', 'qa_suggestions'].map((section) => (
                <article key={section}>
                  <strong>{section.replaceAll('_', ' ')}</strong>
                  <ul>
                    {outline[section].map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </section>
    </>
  );
}
