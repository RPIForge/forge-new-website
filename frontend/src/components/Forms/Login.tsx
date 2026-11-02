import * as React from 'react';
import { FormEvent, useState } from 'react';
import useAuth from '../Auth/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRecoilState } from 'recoil';
import { userState } from 'src/GlobalAtoms';
import { User } from 'src/interfaces';

import AuthLayout, {
    AuthButtonRow,
    AuthDivider,
    AuthField,
    AuthFields,
    AuthPrimaryButton,
    AuthPrompt,
    AuthSmallButton,
    AuthTitle,
    AuthWideLink,
} from './AuthLayout';
import { jwtDecode, JwtPayload } from 'jwt-decode';
import { AuthAPI } from 'src/apis/AuthAPI';

interface CustomJwtPayload extends JwtPayload {
    expires_at?: number;
    issued_at?: number;
}

export default function Login() {

    const [username, setUsername] = useState<string>('');
    const [password, setPassword] = useState<string>('');

    const { setAuth, setUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const getUserData = async (): Promise<User | null> => {
        try {
            const response = await AuthAPI.me();

            if (response.status === 200) {
                const result = await response.data;

                return result;
            } else {
                console.error('Retrieve User Data failed:', response.status);
            }
        } catch (error) {
            console.error('Error:', error);
        }
        return null;
    }

    const handleLogin = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
        e.preventDefault();

        try {
            const response = await AuthAPI.login(username, password);
            console.log('Login response:', response);
            
            if (response.status === 200) {
                const result = response.data;
                const token = result.access_token;
                const expiration = Math.floor(Date.now() / 1000) + 3 * 60;
                console.log('Expires at:', expiration * 1000);
                console.log('Expires in (minutes):', (expiration * 1000 - Date.now()) / 1000 / 60);

                setAuth(true);
                localStorage.setItem('authToken', token);
                localStorage.setItem('token_expiration', expiration.toString() || '0');
                const userData = await getUserData();
                if (userData) {
                    setUser(userData);
                    localStorage.setItem('user', JSON.stringify(userData));
                }
                const from = location.state?.from?.pathname || '/myforge';
                navigate(from, { state: { justLoggedIn: true } });
            } else {
                console.error('Login failed:', response.status);
                console.error('Login failed:', response.statusText);
                alert('Login failed:' + " " + response.status);
                alert('Login failed:' + " " + response.statusText);
            }
        } catch (error) {
            console.error('Error:', error);
            if (error.status === 401) {
                alert('Invalid username or password');
            } else{
                alert('Error occured:' + error);
            }
        }
    };

    return (
        <AuthLayout>
            <form onSubmit={handleLogin}>
                <AuthTitle>Sign In</AuthTitle>
                <AuthDivider />
                <AuthFields>
                    <AuthField>
                        <label htmlFor="login-rcsid">RCS ID</label>
                        <input
                            id="login-rcsid"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            maxLength={10}
                            autoComplete="username"
                        />
                    </AuthField>
                    <AuthField>
                        <label htmlFor="login-password">Password</label>
                        <input
                            id="login-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                    </AuthField>
                </AuthFields>
                <AuthButtonRow>
                    <AuthPrimaryButton type="submit">Start Making!</AuthPrimaryButton>
                    <AuthSmallButton to="/reset-password">Forgot Password?</AuthSmallButton>
                </AuthButtonRow>
                <AuthDivider gap="27px 0 11px" />
                <AuthPrompt>Don’t have an account?</AuthPrompt>
                <AuthWideLink to="/register">Register Here!</AuthWideLink>
            </form>
        </AuthLayout>
    )
}