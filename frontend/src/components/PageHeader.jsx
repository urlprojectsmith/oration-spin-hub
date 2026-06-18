export default function PageHeader({ title, kicker, actions }) {
  return (
    <header className="page-header">
      <div>
        <span className="kicker">{kicker}</span>
        <h1>{title}</h1>
      </div>
      {actions ? <div className="header-actions">{actions}</div> : null}
    </header>
  );
}

