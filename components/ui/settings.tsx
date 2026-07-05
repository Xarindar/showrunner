import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

type SettingsCategoryProps = HTMLAttributes<HTMLElement> & {
  description?: ReactNode;
  title: ReactNode;
};

export function SettingsCategory({ children, className, description, title, ...props }: SettingsCategoryProps) {
  return (
    <section className={cx("ui-settings-category", className)} {...props}>
      <div className="ui-settings-category-head">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="ui-settings-category-body">{children}</div>
    </section>
  );
}

type SettingsGroupProps = HTMLAttributes<HTMLElement> & {
  description?: ReactNode;
  title: ReactNode;
};

export function SettingsGroup({ children, className, description, title, ...props }: SettingsGroupProps) {
  return (
    <section className={cx("ui-settings-group", className)} {...props}>
      <div className="ui-settings-group-head">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="ui-settings-group-body">{children}</div>
    </section>
  );
}

type SettingRowProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  description?: ReactNode;
  title: ReactNode;
};

export function SettingRow({ children, className, description, title, ...props }: SettingRowProps) {
  return (
    <div className={cx("ui-setting-row", className)} {...props}>
      <span className="ui-setting-row-copy">
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      {children ? <span className="ui-setting-row-control">{children}</span> : null}
    </div>
  );
}

export function SettingControlGroup({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx("ui-setting-control-group", className)} {...props}>
      {children}
    </span>
  );
}

type SettingValueGroupProps = HTMLAttributes<HTMLSpanElement> & {
  columns?: 1 | 2;
};

export function SettingValueGroup({ children, className, columns = 1, ...props }: SettingValueGroupProps) {
  return (
    <span className={cx("ui-setting-value-group", className)} data-columns={columns} {...props}>
      {children}
    </span>
  );
}
