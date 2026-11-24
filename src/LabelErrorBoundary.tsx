import { Component, type ReactNode } from "react";

interface Props {
  /** Which pass of which job this is, in words, for the message. */
  what: string;
  children: ReactNode;
  onBack(): void;
  /** Deletes the saved progress of this pass. Only called after the labeler confirms. */
  onDeleteSaved(): void;
}

interface State {
  error: Error | null;
  confirming: boolean;
  /** Changes after a reset so the children start again from scratch. */
  attempt: number;
}

/**
 * Catches a labeling screen that cannot open. The one realistic cause is saved
 * progress that no longer matches the job's task file (the core refuses it and
 * leaves it untouched). Without this the page would go blank; with it the
 * labeler can go back, or delete that pass's saved progress and start again.
 */
export class LabelErrorBoundary extends Component<Props, State> {
  state: State = { error: null, confirming: false, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, confirming: false };
  }

  render() {
    const { error, confirming, attempt } = this.state;
    if (!error) return <div key={attempt}>{this.props.children}</div>;

    return (
      <div className="app-error" style={{ display: "grid", gap: 12 }}>
        <p role="alert" style={{ margin: 0 }}>
          {this.props.what} could not be opened: {error.message}
        </p>
        <p style={{ margin: 0 }}>
          This usually means the saved progress in this browser belongs to an older version of the job. Nothing has
          been changed or deleted. You can go back, or delete the saved progress for this pass and start it again.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" onClick={this.props.onBack}>
            Back to jobs
          </button>
          {confirming ? (
            <>
              <button
                type="button"
                onClick={() => {
                  this.props.onDeleteSaved();
                  this.setState((s) => ({ error: null, confirming: false, attempt: s.attempt + 1 }));
                }}
              >
                Yes, delete the saved progress for this pass
              </button>
              <button type="button" onClick={() => this.setState({ confirming: false })}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" onClick={() => this.setState({ confirming: true })}>
              Delete saved progress for this pass
            </button>
          )}
        </div>
      </div>
    );
  }
}
