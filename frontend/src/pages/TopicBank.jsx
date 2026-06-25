import { Brain, Filter, Plus, Save, Sparkles, ThumbsUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

const emptyTopic = { title: '', description: '', category: 'General', department: '', skill_level: 'intermediate' };
const emptyAi = { department: '', skill_level: 'intermediate', previous_topics: '', trending: '', save: false };

export default function TopicBank() {
  const [topics, setTopics] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(emptyTopic);
  const [aiForm, setAiForm] = useState(emptyAi);
  const [generated, setGenerated] = useState([]);
  const [message, setMessage] = useState('');

  async function load() {
    const suffix = filter ? `?category=${encodeURIComponent(filter)}` : '';
    const [topicRows, categoryRows] = await Promise.all([api(`/topics${suffix}`), api('/topics/categories')]);
    setTopics(topicRows);
    setCategories(categoryRows);
  }

  useEffect(() => {
    load();
  }, [filter]);

  async function submitTopic(event) {
    event.preventDefault();
    await api('/topics', { method: 'POST', body: form });
    setForm(emptyTopic);
    setMessage('Topic suggestion submitted.');
    await load();
  }

  async function vote(topic) {
    await api(`/topics/${topic.id}/vote`, { method: 'POST' });
    await load();
  }

  async function generateTopics(event) {
    event.preventDefault();
    const result = await api('/ai/topics/generate', { method: 'POST', body: aiForm });
    setGenerated(result.topics);
    setMessage(aiForm.save ? `${result.saved.length} generated topics saved.` : 'Generated topic ideas are ready.');
    await load();
  }

  async function saveGenerated(topic) {
    await api('/topics', { method: 'POST', body: { ...topic, source: 'ai' } });
    setMessage('Generated topic saved to the bank.');
    await load();
  }

  return (
    <>
      <PageHeader title="Topic Bank" kicker="suggestions, votes, and generation" />
      {message ? <div className="toast-inline page-toast">{message}</div> : null}

      <section className="topic-layout">
        <aside className="panel topic-sidebar">
          <div className="panel-title">
            <Filter size={20} />
            Categories
          </div>
          <div className="filter-tabs">
            <button className={!filter ? 'active' : ''} onClick={() => setFilter('')}>All</button>
            {categories.map((item) => (
              <button key={item.category} className={filter === item.category ? 'active' : ''} onClick={() => setFilter(item.category)}>
                {item.category} ({item.count})
              </button>
            ))}
          </div>

          <form className="topic-form" onSubmit={submitTopic}>
            <div className="panel-title">
              <Plus size={20} />
              Submit Topic
            </div>
            <input placeholder="Topic title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
            <textarea placeholder="Why this topic matters" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            <div className="form-grid-2">
              <input placeholder="Category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
              <select value={form.skill_level} onChange={(event) => setForm({ ...form, skill_level: event.target.value })}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <input placeholder="Department" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
            <button className="primary-btn">Submit Topic</button>
          </form>
        </aside>

        <section className="topic-main">
          <form className="panel ai-topic-panel" onSubmit={generateTopics}>
            <div className="panel-title">
              <Brain size={20} />
              AI Topic Generator
            </div>
            <div className="form-grid-2">
              <input placeholder="Department" value={aiForm.department} onChange={(event) => setAiForm({ ...aiForm, department: event.target.value })} />
              <select value={aiForm.skill_level} onChange={(event) => setAiForm({ ...aiForm, skill_level: event.target.value })}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              <input placeholder="Previous topics, comma separated" value={aiForm.previous_topics} onChange={(event) => setAiForm({ ...aiForm, previous_topics: event.target.value })} />
              <input placeholder="Trending technologies, comma separated" value={aiForm.trending} onChange={(event) => setAiForm({ ...aiForm, trending: event.target.value })} />
            </div>
            <label className="check-row">
              <input type="checkbox" checked={aiForm.save} onChange={(event) => setAiForm({ ...aiForm, save: event.target.checked })} />
              Save generated topics automatically
            </label>
            <button className="secondary-btn">
              <Sparkles size={16} />
              Generate Topics
            </button>
          </form>

          {generated.length ? (
            <section className="cards-grid generated-grid">
              {generated.map((topic) => (
                <article className="wheel-card" key={topic.title}>
                  <span className="kicker">{topic.category} - {topic.confidence}%</span>
                  <h3>{topic.title}</h3>
                  <p>{topic.description}</p>
                  <button className="secondary-btn" onClick={() => saveGenerated(topic)}>
                    <Save size={16} />
                    Save
                  </button>
                </article>
              ))}
            </section>
          ) : null}

          <section className="topic-list">
            {topics.map((topic) => (
              <article className="panel topic-card" key={topic.id}>
                <div>
                  <span className="kicker">{topic.category} - {topic.skill_level}</span>
                  <h2>{topic.title}</h2>
                  <p>{topic.description || 'No description provided.'}</p>
                  <small>{topic.department || 'Any department'} - {topic.submitted_by_name || 'Unknown'}</small>
                </div>
                <button className="secondary-btn" onClick={() => vote(topic)} disabled={topic.voted_by_me}>
                  <ThumbsUp size={16} />
                  {topic.votes}
                </button>
              </article>
            ))}
            {!topics.length ? <div className="panel empty-state">No topics yet. Submit or generate the first one.</div> : null}
          </section>
        </section>
      </section>
    </>
  );
}
