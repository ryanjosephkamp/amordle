import { ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Icon';

export function NotFoundPage() {
  return (
    <div className="route-error">
      <div className="route-error__mark">
        <Icon name="info" />
      </div>
      <p className="eyebrow">Route recovery</p>
      <h1>Page not found</h1>
      <p>This destination does not exist. Saved game state has not changed.</p>
      <ButtonLink tone="primary" to="/">
        Return Home
      </ButtonLink>
      <p className="continuity-note">Local Solo / Practice remains available.</p>
    </div>
  );
}
