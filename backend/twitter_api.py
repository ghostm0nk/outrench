import requests
import uuid

# This is the standard public bearer token used by Twitter's web client
TWITTER_WEB_BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"

def verify_twitter_credentials(auth_token: str) -> dict:
    """
    Uses the auth_token cookie to ping Twitter's internal verify_credentials endpoint.
    Returns the user's handle, name, and high-res avatar.
    Raises an Exception if the token is invalid or expired.
    """
    # Twitter requires a CSRF token (ct0) to accompany the auth_token
    # We can generate a random 32-char hex string, set it as the ct0 cookie, 
    # and pass it in the x-csrf-token header.
    csrf_token = uuid.uuid4().hex

    cookies = {
        'auth_token': auth_token,
        'ct0': csrf_token
    }

    headers = {
        'authorization': f'Bearer {TWITTER_WEB_BEARER}',
        'x-csrf-token': csrf_token,
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en',
        'x-twitter-active-user': 'yes',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    url = 'https://api.twitter.com/1.1/account/verify_credentials.json'
    
    # We use a 10s timeout
    res = requests.get(url, headers=headers, cookies=cookies, timeout=10.0)

    if res.status_code == 200:
        data = res.json()
        
        # Get the highest resolution avatar by removing "_normal" from the URL
        avatar_url = data.get("profile_image_url_https", "")
        if avatar_url:
            avatar_url = avatar_url.replace("_normal", "")

        return {
            "handle": f"@{data.get('screen_name')}",
            "name": data.get("name"),
            "avatar_url": avatar_url
        }
    else:
        raise Exception(f"Twitter API error ({res.status_code}): Invalid or Expired auth_token.")
