//@ts-nocheck
import type { Component, ComponentInstance, DLElement } from "dreamland/core";
let globalrouter: Router | null = null;

export class Router {
  private el: HTMLElement = null!;

  constructor(private root: ComponentInstance<typeof Route>) {
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
    if (this.root.$.state.path) throw new Error("Root route cannot have a path");

    let url = new URL(path, location.origin);

    path = url.pathname;

    if (path[0] == "/") path = path.slice(1);

    return this.subroute(path, path, this.root)!;
  }


  private subroute(path: string, subpath: string, root: ComponentInstance<typeof Route>): boolean | null {
    match: for (let route of root.$.children) {
      let routepath = route.$.state.path;
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
        let to = route.$.state.to;
        if (typeof to == "function") to = to(path, urlparams);
        a.href = to;

        this.navigate(a.pathname + a.search);

        // cancel
        return null;
      }

      if (route.$.children.length > 0) {
        // if child 404s start matching back from parent

        let res = this.subroute(path, splitpath.join("/"), route as ComponentInstance<typeof Route>);
        if (res === null) return null;

        if (!res) continue match;
      }

      // if we got here, we have a match
      let show = route.$.state.show;
      if (typeof show == "function") show = show(path, urlparams);

      if (!show) throw new Error(`Route ${route.$.state.path} has no show target`);


      if ("$" in show) {
        for (let key in urlparams) {
          show.$.state[key] = urlparams[key];
        }

        show.$.state.routeshown = true;
        if (show.$.state.routeshow)
          show.$.state.routeshow(path);
      }

      for (let otherroute of root.$.children) {
        if (otherroute.$ instanceof Redirect) continue;

        if (!otherroute.$.state.show) throw new Error(`Route ${otherroute.$.state.path} has no show target`);
        if ("$" in otherroute.$.state.show && otherroute.$.state.show != show) {
          otherroute.$.state.show.$.state.routeshown = false;
          if (otherroute.$.state.show.$.state.routehide)
            otherroute.$.state.show.$.state.routehide();
        }
      }

      if (root == this.root && !this.root.$.state.show) {
        this.el.replaceWith(show);
      } else {
        let parentshow = root.$.state.show
        if (!("$" in parentshow!)) throw new Error("If subroutes are specified, show target must be a functional component");

        parentshow.$.state.outlet = show;
      }

      return true;
    }

    return false;
  }

  public mount(root: HTMLElement) {
    if (this.root.$.state.show) {
      let show = this.root.$.state.show;
      if (typeof show == "function") show = show(location.pathname, {});
      this.el = show;
    } else {
      this.el = document.createElement("temporary")
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
}, {}, {}> = function() {
  // exists only to collect data
  return document.createElement("div");
}

export const Redirect: Component<{
  path: string;
  to: string | ((path: string) => string);
}> = function() {

  return document.createElement("div");
}
