# WordPress essays

The `/essay` and `/essay/:slug` pages read published posts from the
WordPress REST API at essay.eudaimonias.me (see `lib/wordpress.js`).
Only posts with status `publish` are shown. Pending, draft, private and
scheduled posts are never displayed.

By default (`WP_CACHE_TTL_SECONDS=0`) every page view asks WordPress
directly, so approving or unpublishing an essay shows immediately and
no setup is needed. The last good response is kept only as a fallback
for when WordPress is down.

## Optional: caching with an instant-refresh hook

Only needed if traffic grows and you set `WP_CACHE_TTL_SECONDS` above 0.
WordPress then pings this site whenever an essay is published,
unpublished or edited, and the cache is cleared, so approvals still
show instantly.

### Setup

1. On this site, set `REVALIDATE_SECRET` in `.env` to a long random string
   (see `.env.example`) and restart the server.
2. On WordPress, add the snippet below. Use either the **Code Snippets**
   plugin (Snippets → Add New → PHP, "Run everywhere") or the child
   theme's `functions.php`. Replace the two values at the top.

```php
<?php
// Tell www.eudaimonias.me to refresh its essay cache when a post is
// published, unpublished or edited while published.
const EUD_REVALIDATE_URL    = 'https://www.eudaimonias.me/api/wp-revalidate';
const EUD_REVALIDATE_SECRET = 'paste-the-same-REVALIDATE_SECRET-here';

function eud_ping_essay_site() {
    wp_remote_post( EUD_REVALIDATE_URL, array(
        'headers'  => array( 'x-revalidate-secret' => EUD_REVALIDATE_SECRET ),
        'timeout'  => 3,
        'blocking' => false,
    ) );
}

// Approved (pending → publish), unpublished (publish → anything),
// trashed, or edited while published.
add_action( 'transition_post_status', function ( $new_status, $old_status, $post ) {
    if ( $post->post_type !== 'post' ) {
        return;
    }
    if ( $new_status === 'publish' || $old_status === 'publish' ) {
        eud_ping_essay_site();
    }
}, 10, 3 );
```

### Testing the hook

```
curl -X POST https://www.eudaimonias.me/api/wp-revalidate -H "x-revalidate-secret: <secret>"
```

`{"ok":true}` means the cache was cleared. A wrong or missing secret
returns 401. The hook is also disabled (401) when `REVALIDATE_SECRET`
is empty.
