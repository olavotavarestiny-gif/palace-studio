export function Brand({ className = "" }: { className?: string }) {
  return (
    <div className={`brand ${className}`}>
      <img src="/brand/logo.jpg" alt="Palace Lounge" width="973" height="973" />
    </div>
  );
}
