# CoffeeHaml Syntax Examples

## 1. Basic Elements

### HTML elements

```haml
%div
%span
%button
%input/
%br/
```

The `/` suffix produces a self-closing element. In React, this means
`jsx("br", null)` — no children.

### Component elements

```haml
%MyComponent
%UserProfile
%Router.Link
```

Capitalized tags become component references. Dotted names like
`%Router.Link` work — the tag is emitted as `Router.Link`.

---

## 2. Class and ID Shorthand

```haml
%div.container
%span#main-content
%button.primary.large#submit-btn
```

Multiple classes and IDs chain:

```haml
%div.container.fluid#main
```

Equivalent to writing `{className: "container fluid", id: "main"}`.

### Implicit div

```haml
.container
  %p Content

#sidebar
  %nav Links
```

No `%div` needed — `.class` or `#id` alone creates a `<div>`.

---

## 3. Attributes

### Braces syntax `{...}`

```haml
%div{class: "container", id: "main"}
%input{type: "text", placeholder: "Search", disabled: true}
%Button{onClick: handleClick, variant: "primary"}
```

### Parens syntax `(...)`

```haml
%div(class: "container", id: "main")
%Button(onClick: handleClick, variant: "primary")
```

Both are equivalent. Braces match Haml convention; parens feel like
function calls — natural for React components.

### CoffeeScript expressions in attribute values

```haml
%div{
  className: if active then "active" else "inactive"
  style: {color: theme.primary, fontSize: 14}
  onClick: (e) -> handleClick(e, item.id)
}
```

Any CoffeeScript expression is valid.

### Shorthand boolean attributes

```haml
%input{required, disabled}
```

CoffeeScript shorthand `{required}` → `{required: true}`.

### Splat attributes

```haml
%div{props..., className: "extra"}
```

Merges `props` object with additional overrides.

### String keys

```haml
%div{"data-x": value, "aria-label": "Close"}
```

Quoted keys for non-identifier property names.

### No attributes

```haml
%div
%p
%Component
```

Empty attribute block is optional.

---

## 4. Inline Content

### Inline text

```haml
%h1 Welcome to CoffeeHaml
%p This is a paragraph.
%span Click
```

Text after the tag (and optional attributes) becomes a child text node.

### Inline output

```haml
%h1 = pageTitle
%p Hello, = user.name
%span Total: = items.length
```

`=` inserts the expression result. Mixed text and output on the same
line concatenates.

### Inline text with dynamic class

```haml
%span.status{class: status} = statusText
```

Attribute block before the text/output.

---

## 5. Nested Children

```haml
%div.container
  %header
    %h1 = title
  %main
    %p Welcome
    %Button{onClick: start} Get Started
  %footer
    %p © = year
```

Indentation creates nesting. This is the heart of Haml's readability.

### Deep nesting

```haml
%ul
  %li
    %a{href: url}
      %span.icon
      = label
```

---

## 6. Output

### Escaped output (`=`)

```haml
%p = user.bio
```

Emits escaped text (React handles this by default with string children).

### Unescaped output (`==`)

```haml
%div == user.richBioHTML
```

Passes raw HTML. In React, this would need `dangerouslySetInnerHTML` or
similar — the emitter wraps accordingly.

### Standalone output

```haml
= greeting
= formatDate(today)
```

Output at the top level becomes a text node in the parent (or a fragment
child).

---

## 7. Control Flow

### If / else

```haml
- if user
  %WelcomeBanner{user: user}
- else
  %LoginButton
```

### Unless

```haml
- unless items.length
  %EmptyState
```

### If / else if / else chain

```haml
- if status == "loading"
  %Spinner
- else if status == "error"
  %ErrorMessage{message: error}
- else
  %Content{data: data}
```

### For loop

```haml
- for item in items
  %ItemCard{item: item}
```

### For loop with index

```haml
- for item, index in items
  %Row{item: item, key: index}
```

### For loop with destructuring

```haml
- for {name, age} in users
  %UserRow{name: name, age: age}
```

### For loop with `when` filter

```haml
- for item in items when item.active
  %ActiveItem{item: item}
```

CoffeeScript comprehensions fully supported.

### For-of loop

```haml
- for item of iterable
  %Item{item: item}
```

### While loop

```haml
- while hasMore
  %LoadMore{onLoad: fetchNext}
```

### Nested control flow

```haml
- if user
  %Dashboard
    - for project in user.projects
      %ProjectCard{project: project}
        - if project.urgent
          %Badge{kind: "urgent"}
```

### Arbitrary CoffeeScript

```haml
- console.log("rendering dashboard")
- setupSubscriptions()

%Dashboard
```

Statements that are not recognized control keywords are emitted verbatim
as JavaScript.

---

## 8. Comments

### Haml comments (removed)

```haml
-# This is a comment, not in output
-# TODO: implement pagination
%div
  -# This child is commented out
  -# %p Not rendered
  %p Rendered
```

Haml comments and their nested children are stripped entirely.

### HTML comments

```haml
/ This appears in output
/ <!-- visible in devtools -->
```

---

## 9. Filters

### CSS

```haml
%head
  :css
    body {
      margin: 0;
      font-family: sans-serif;
    }
    .container {
      max-width: 1200px;
    }
```

### JavaScript

```haml
:javascript
  window.APP_CONFIG = {
    version: "1.0.0"
  };
```

### CoffeeScript

```haml
:coffeescript
  init = ->
    console.log "ready"
  init()

---

## 11. Statement Continuation (v0.4.2)

Indented children of `-` control blocks compile as continuation code lines.
No more single-line straitjacket for complex logic:

```haml
- if user.role == 'admin' && user.permissions.includes('write')
  %AdminPanel
    %h2 Admin
    %p Welcome back, = user.name
```

Multi-statement blocks:

```haml
- if results.length > 0
  sorted = results.sort (a, b) -> b.score - a.score
  topThree = sorted.slice 0, 3
  %Results{ data: topThree }
```

Works with `for`, `while`, and bare statements too:

```haml
%div
  - x = computeBaseValue()
  - x *= multiplier
  - x += offset
  %p= x
```

---

## 12. Expression Continuation (v0.5.0)

Long inline expressions can break across indented continuation lines:

```haml
%h1= "Welcome, " +
  user.firstName + " " +
  user.lastName

%div= someFunction(
  arg1,
  arg2,
  arg3
)
```

Indented TEXT children of `=` are joined into the expression before compilation:

```haml
%p= formatMessage(
  user.name,
  user.role,
  if premium then "⭐" else ""
)
```

---

## 13. Arrow Continuation (v0.6.0)

`=` with an arrow function can have indented element children — the elements
become the arrow body's JSX:

```haml
%ul
  = items.map (item) ->
    %li{ key: item.id }
      %span.icon= item.icon
      %a{ href: item.url }= item.label
```

Compiles to:

```js
jsx("ul", null,
  ...items.map(item => jsx("li", { key: item.id },
    jsx("span", { className: "icon" }, item.icon),
    jsx("a", { href: item.url }, item.label)
  ))
)
```

Works inline within elements too:

```haml
%Dashboard
  = widgets.filter (w) -> w.active
    .map (w) ->
      %WidgetCard{ widget: w, key: w.id }
```

---

## 14. CLI Init Scaffold (v0.6.0)

Interactive project setup wizard:

```bash
$ npx coffeehaml init

  ☕ CoffeeHaml init — project scaffold
  Working directory: /my-react-app
  Detected: package.json, Vite, TypeScript

  Add coffeehaml as devDependency? (Y/n):
  Configure Vite plugin? (Y/n):
  Create sample .chaml component? (Y/n):
  Add build/watch scripts to package.json? (Y/n):
```

Detects your project type, installs dependencies, patches Vite config,
creates a sample component, and adds npm scripts — all interactive.

---

## 15. Watch Mode (v0.5.0)

```bash
# Watch and recompile on every change
$ npx coffeehaml watch src/ --wrap component

# With observer HOC wrapping
$ npx coffeehaml watch src/ --wrap observer
```

Uses native `fs.watch` — zero dependencies. Recursively scans on startup,
recompiles individual files on change.

---

## 16. HOC Wrapping (v0.4.0)

Wrap components in higher-order functions:

```haml
-# With Vite plugin (default: component)
-# Or via CLI / Node API:

%div.page
  %h1 Hello
```

```bash
# Single HOC
$ npx coffeehaml compile app.chaml --wrap observer
# → export default observer(function App(props) { ... })

# HOC chain
$ npx coffeehaml compile app.chaml --wrap observer,memo,forwardRef
# → export default observer(memo(forwardRef(function App(props) { ... })))
```

Node API:

```js
compile(source, { wrap: ['observer', 'memo'] })
compile(source, { wrap: 'observer' })
compile(source, { wrap: 'component' })  // plain component
```

---

## 17. Multi-Error Parser Recovery (v0.6.0)

The parser no longer stops at the first error. It collects all errors,
recovers at structural boundaries, and returns a partial AST:

```js
const result = compile(brokenSource);
console.log(result.errors);
// [
//   { message: "Unexpected token '}'", location: { line: 3, column: 12 } },
//   { message: "Unclosed attribute block", location: { line: 7, column: 1 } },
// ]
```

Errors carry source locations (line/column) for IDE integration and
clickable terminal output.

---

## 18. Source-Located Errors (v0.5.0)

All errors carry file, line, and column:

```bash
$ npx coffeehaml compile bad.chaml
Error: bad.chaml:12:3 — Unexpected ')' in expression
  %div{ onClick: -> handle() ) }
                ^
```

CoffeeScript compile errors are wrapped with source location context,
making it clear which `.chaml` line triggered the failure.
```

### Markdown (build-time)

```haml
%article
  :markdown
    # Title

    This is **markdown** content.

    - Item 1
    - Item 2
```

---

## 10. Complete Component Examples

### Simple component

```haml
%Button{onClick: save, disabled: !valid}
  Save Changes
```

Compiles to:

```js
jsx(Button, { onClick: save, disabled: !valid }, "Save Changes")
```

### List component

```haml
%ul.todo-list
  - for todo in todos
    %TodoItem{
      todo: todo
      key: todo.id
      onToggle: -> toggleTodo(todo.id)
      onDelete: -> deleteTodo(todo.id)
    }
```

### Layout component

```haml
%div.app-layout
  %Header{user: currentUser}
  %main.content
    = children
  %Footer
    %p © = new Date().getFullYear()
```

### Form component

```haml
%form{onSubmit: handleSubmit}
  %fieldset
    %legend Contact Info

    %label{htmlFor: "name"} Name
    %input#name{
      type: "text"
      value: name
      onChange: (e) -> setName(e.target.value)
    }

    %label{htmlFor: "email"} Email
    %input#email{
      type: "email"
      value: email
      onChange: (e) -> setEmail(e.target.value)
    }

  %Button{type: "submit", disabled: !valid}
    Submit
```

### Conditional rendering

```haml
%div.dashboard
  - if loading
    %Spinner
  - else if error
    %ErrorBanner{message: error}
  - else
    - if data.length
      - for item in data
        %DataCard{item: item, key: item.id}
    - else
      %EmptyState{
        message: "No data yet"
        onAction: fetchData
      }
```

### SVG element

```haml
%svg{
  xmlns: "http://www.w3.org/2000/svg"
  viewBox: "0 0 100 100"
  width: 100
  height: 100
}
  %circle{
    cx: 50
    cy: 50
    r: 40
    fill: color
    stroke: "black"
    strokeWidth: 2
  }
```

---

## 11. Comparison: JSX vs CoffeeHaml

### JSX

```jsx
<div className="container">
  <header>
    <h1>{pageTitle}</h1>
    <nav>
      {links.map(link => (
        <NavLink key={link.id} href={link.url} active={link.active}>
          {link.label}
        </NavLink>
      ))}
    </nav>
  </header>
  <main>
    {loading ? (
      <Spinner />
    ) : error ? (
      <ErrorBanner message={error} />
    ) : (
      <Content data={data} />
    )}
  </main>
</div>
```

### CoffeeHaml

```haml
%div.container
  %header
    %h1 = pageTitle
    %nav
      - for link in links
        %NavLink{
          key: link.id
          href: link.url
          active: link.active
        }
          = link.label
  %main
    - if loading
      %Spinner
    - else if error
      %ErrorBanner{message: error}
    - else
      %Content{data: data}
```

The CoffeeHaml version has **no closing tags**, **no curly braces for
children**, **no ternary operator noise**, and **fewer lines**.

---

## 12. CoffeeScript Features Used

### Arrow functions

```haml
%Button{onClick: -> handleClick()}
%Button{onClick: (e) -> handleClick(e)}
%Button{onClick: (e) => handleClick(e)}  // bound
```

### String interpolation

```haml
%p = "Hello, #{user.name}!"
%img{alt: "Photo of #{user.name}"}
```

### Existential operator

```haml
%div = user?.profile?.bio ?: "No bio"
```

### Destructuring

```haml
- for {name, email} in users
  %UserCard{name: name, email: email}
```

### Splats in attributes

```haml
%div{commonProps..., className: "special"}
```

### Chained comparisons

```haml
- if 0 < count < 10
  %Badge = count
```

---

## 13. Complete Application Page

```haml
%div.app#main-app
  %Navigation{
    user: currentUser
    routes: appRoutes
    onLogout: handleLogout
  }

  %main.content
    - if loading
      %LoadingScreen
    - else if !currentUser
      %LoginPage{onLogin: handleLogin}
    - else
      %Dashboard{user: currentUser}
        %StatsPanel{stats: dashboardStats}

        %section.recent-activity
          %h2 Recent Activity
          - for activity in recentActivities
            %ActivityCard{activity: activity, key: activity.id}

        %section.projects
          %h2 Projects
          - if projects.length
            %ProjectGrid
              - for project in projects
                %ProjectCard{
                  project: project
                  key: project.id
                  onClick: -> navigateTo(project.url)
                }
          - else
            %EmptyState{
              icon: "folder"
              message: "No projects yet"
              onAction: -> createProject()
            }

  %Footer
    %p = "© #{new Date().getFullYear()} #{companyName}"
    %nav
      - for link in footerLinks
        %a{key: link.id, href: link.url} = link.text
```

---

## 14. Edge Cases & FAQ

### Multi-line attributes

Attributes can span multiple lines within `{...}`:

```haml
%ComplexComponent{
  data: fetchData()
  columns: [
    {key: "name", title: "Name"}
    {key: "age",  title: "Age"}
  ]
  onSort: (col) -> sortBy(col.key)
  onFilter: (query) -> filterData(query)
}
```

### Empty elements

```haml
%div
```

Emits `jsx("div", null)` — a div with no children and no props.

### Text starting with special characters

Use `\` to escape:

```haml
\% Not a tag
\= Not output
\- Not control
```

Or use a plain text region:

```haml
%p
  This line starts with % but it's fine inside an element.
```

### Dynamic tag name

```haml
%{dynamicTag}{props} content
```

Actually, this is tricky. For dynamic tags, use a component:

```haml
%DynamicComponent{tag: dynamicTag, props: props}
  content
```

Or use a raw CoffeeScript expression:

```haml
- output = jsx(dynamicTag, props, "content")
= output
```

(But this loses Haml structure. A future version may support `%{expr}`.)

### React.Suspense / React.Fragment

```haml
%Suspense{fallback: %Spinner}
  %LazyComponent
```

Fragments are implicit — multiple top-level nodes in a Document emit
a React Fragment automatically.