let globalrouter: Router | null = null;

export class Router {
  private el: HTMLElement = null!;

  constructor(private root: ComponentElement<typeof Route>) {
    if (globalrouter) {
      throw new Error("Only one router can be created");
    }

    globalrouter = this;

    (window as any).r = globalrouter;
  }

  public navigate(path: string): boolean {
    history.pushState(null, "", path);
    return this.route(path);
  }

  public route(path: string): boolean {
    if (this.root.$.path) throw new Error("Root route cannot have a path");

    let url = new URL(path, location.origin);

    path = url.pathname;

    if (path[0] == "/") path = path.slice(1);

    return this.subroute(path, path, this.root)!;
  }


  private subroute(path: string, subpath: string, root: ComponentElement<typeof Route>): boolean | null {
    match: for (let route of root.$.children) {
      let routepath = route.$.path;
      if (typeof routepath !== "string") throw new Error("Route must have a path");
      if (routepath[0] == "/") routepath = routepath.slice(1);

      let splitpath = subpath.split("/");
      let splittarget = routepath.split("/");


      let urlparams: Record<string, string> = {};

      while (true) {
        let pathpart = splitpath.shift();
        let target = splittarget.shift();

        // both empty => exact match
        if (!pathpart && !target) break;

        // matched fully, but there's more url to go => try to match children
        if (!target && pathpart && route.$.children.length > 0) {
          splitpath.unshift(pathpart);
          break;
        }

        // only a partial match of target => no match
        if (!pathpart || !target) continue match;


        if (target.startsWith(":")) {
          let varname = target.slice(1);
          urlparams[varname] = pathpart;
        } else if (target.startsWith("*")) {
          // don't check the rest of the path
          break;
        } else if (pathpart != target) {
          continue match;
        }
      }

      if (route.$ instanceof Redirect) {
        let a = document.createElement("a");
        let to = route.$.to;
        if (typeof to == "function") to = to(path, urlparams);
        a.href = to;

        this.navigate(a.pathname + a.search);

        // cancel
        return null;
      }

      if (route.$.children.length > 0) {
        // if child 404s start matching back from parent

        let res = this.subroute(path, splitpath.join("/"), route as ComponentElement<typeof Route>);
        if (res === null) return null;

        if (!res) continue match;
      }

      // if we got here, we have a match
      let show = route.$.show;
      if (typeof show == "function") show = show(path, urlparams);

      if (!show) throw new Error(`Route ${route.$.path} has no show target`);


      if ("$" in show) {
        for (let key in urlparams) {
          show.$[key] = urlparams[key];
        }

        show.$.routeshown = true;
        if (show.$.routeshow)
          show.$.routeshow(path);
      }

      for (let otherroute of root.$.children) {
        if (otherroute.$ instanceof Redirect) continue;

        if (!otherroute.$.show) throw new Error(`Route ${otherroute.$.path} has no show target`);
        if ("$" in otherroute.$.show && otherroute.$.show != show) {
          otherroute.$.show.$.routeshown = false;
          if (otherroute.$.show.$.routehide)
            otherroute.$.show.$.routehide();
        }
      }

      if (root == this.root && !this.root.$.show) {
        this.el.replaceWith(show);
      } else {
        let parentshow = root.$.show
        if (!("$" in parentshow!)) throw new Error("If subroutes are specified, show target must be a functional component");

        parentshow.$.outlet = show;
      }

      return true;
    }

    return false;
  }

  public mount(root: HTMLElement) {

    if (this.root.$.show) {
      let show = this.root.$.show;
      if (typeof show == "function") show = show(location.pathname, {});
      this.el = show;
    } else {
      this.el = <temporary />;
    }

    root.append(this.el);
    this.route(location.pathname + location.search);

    window.addEventListener("popstate", () => {
      this.route(location.pathname + location.search);
    });

  }


}

type ShowTarget = DLElement<{
  outlet?: HTMLElement
  routeshow?: (path: string) => void
  routehide?: () => void
  routeshown: boolean

  [index: string]: any
}> | HTMLElement

export const Route: Component<{
  path?: string;
  show?: ShowTarget | ((path: string, params: Record<string, string>) => ShowTarget)
}, {}, {
  children: (ComponentElement<typeof Route> | ComponentElement<typeof Redirect>)[]
}> = function() {
  // exists only to collect data
  return <div />;
}

export const Redirect: Component<{
  path: string;
  to: string | ((path: string) => string);
}> = function() {

  return <div />;
}

export const Link: Component<{
  href: string;
  class?: string;
}, {
  _leak: true
  root: HTMLAnchorElement
  children: any
}> = function() {
  this._leak = true;

  return <a href={this.href} class={use(this.class)}
    on:click={e => {
      e.preventDefault();
      if (!globalrouter) throw new Error("No router exists");
      globalrouter.navigate(this.root.href);
    }}>{this.children}</a>
}
