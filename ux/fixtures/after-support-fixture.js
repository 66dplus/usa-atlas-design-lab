export function afterSupportFixture(){
  return `<section class="after-support-preview" aria-labelledby="after-support-title">
    <div class="after-support-copy"><h1 id="after-support-title">You’re part of<br>what comes next.</h1><p>Thank you for supporting USA X-Ray. Leave a contact or a note if you’d like me to hear from you.</p><span>— Dmitrii</span></div>
    <form class="after-support-form" autocomplete="on">
      <label>Your contact (optional)<input type="text" autocomplete="email" placeholder="Email or a profile link"></label>
      <label>Your message (optional)<textarea rows="4" placeholder="An idea, a wish, or just a hello…"></textarea></label>
      <p>Only Dmitrii will see what you share. Your contact will only be used to reply.</p>
      <button class="primary-button" type="button">Send message <span aria-hidden="true">→</span></button>
      <button class="after-support-skip" type="button">Skip and explore</button>
    </form>
  </section>`;
}
