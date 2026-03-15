import os
import time
import getpass

SESSION_DIR = os.path.join(os.path.dirname(__file__), "browser_session")


def main():
    print("\n═══════════════════════════════════════════")
    print("  GHOST DRIVER — Session Setup")
    print("═══════════════════════════════════════════")

    X_USERNAME = input("\nEnter your X username or email: ").strip()
    X_PASSWORD = getpass.getpass("Enter your X password (hidden): ").strip()

    if not X_USERNAME or not X_PASSWORD:
        print("\n⚠ Username and password are required.\n")
        return


    print(f"\nLogging in as: {X_USERNAME}")
    print(f"Session will be saved to: {SESSION_DIR}\n")

    os.makedirs(SESSION_DIR, exist_ok=True)

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            SESSION_DIR,
            headless=False,
            slow_mo=80,
            args=['--no-first-run', '--no-default-browser-check'],
            user_agent=(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/120.0.0.0 Safari/537.36'
            ),
            viewport={'width': 1280, 'height': 800}
        )

        page = context.pages[0] if context.pages else context.new_page()

        # Check if already logged in
        print("Checking existing session...")
        page.goto("https://x.com/home", wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)

        if "home" in page.url:
            print("\n✓ Already logged in! Session is valid.")
            context.close()
            print("Ghost Driver is ready. Start the agent from your Web Terminal.\n")
            return

        # Not logged in — auto fill the form
        print("Session expired or not found. Logging in automatically...\n")
        page.goto("https://x.com/i/flow/login", wait_until="domcontentloaded", timeout=30000)
        time.sleep(2)

        # Step 1: Username / email
        print("Step 1: Entering username...")
        try:
            username_input = page.locator('input[autocomplete="username"]')
            username_input.wait_for(timeout=8000)
            username_input.fill(X_USERNAME)
            time.sleep(0.5)
            # Click Next button
            page.keyboard.press("Enter")
            time.sleep(2)
            print("✓ Username submitted")
        except Exception as e:
            print(f"⚠ Username step failed: {e}")

        # Step 2: Handle "unusual activity" check — X sometimes asks for phone/email
        time.sleep(1)
        try:
            unusual_input = page.locator('input[data-testid="ocfEnterTextTextInput"]')
            if unusual_input.count() > 0:
                print("Step 2: X is asking for verification (phone/email).")
                print(f"Trying with: {X_USERNAME}")
                unusual_input.fill(X_USERNAME)
                page.keyboard.press("Enter")
                time.sleep(2)
        except Exception:
            pass

        # Step 3: Password
        print("Step 3: Entering password...")
        try:
            password_input = page.locator('input[name="password"]')
            password_input.wait_for(timeout=8000)
            password_input.fill(X_PASSWORD)
            time.sleep(0.5)
            page.keyboard.press("Enter")
            time.sleep(3)
            print("✓ Password submitted")
        except Exception as e:
            print(f"⚠ Password step failed: {e}")

        # Step 4: Wait for 2FA or home feed
        print("\nWaiting for home feed (or complete 2FA manually if prompted)...")
        deadline = time.time() + 120
        while time.time() < deadline:
            time.sleep(2)
            try:
                url = page.url
                if "/home" in url:
                    print("\n✓ Login successful! Saving session...")
                    time.sleep(2)
                    context.close()
                    print("✓ Session saved.")
                    print("\nGhost Driver is ready. Start the agent from your Web Terminal.\n")
                    return
            except Exception:
                break

        print("\n⚠ Could not confirm login. Check the browser window.")
        print("If 2FA appeared — complete it manually, then re-run this script.")
        try:
            context.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
