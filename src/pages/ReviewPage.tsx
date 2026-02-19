import { Navigate } from 'react-router-dom'

export default function ReviewPage() {
  // Review is now inline as part of the /new wizard flow.
  return <Navigate to="/new" replace />
}
