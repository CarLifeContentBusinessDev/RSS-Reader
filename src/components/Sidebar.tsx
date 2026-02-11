import { NavLink } from "react-router-dom";

const Sidebar = () => {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="eyebrow">RSS → SQL</span>
        <strong>Builder</strong>
      </div>
      <nav className="sidebar-nav">
        <NavLink
          to="/programs"
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          프로그램
        </NavLink>
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          에피소드
        </NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;
